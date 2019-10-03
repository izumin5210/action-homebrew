"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const tc = __importStar(require("@actions/tool-cache"));
const github = __importStar(require("@actions/github"));
const inputByMaltmillFlag = {
    arch: 'arch',
    os: 'os',
    'build-ldflags': 'ldflags',
    'build-tags': 'tags',
    d: 'dest',
    n: 'name',
};
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const ghToken = core.getInput("github-token", { required: true });
            const releaseGhToken = core.getInput("release-github-token", { required: true });
            const [appOwner, appRepo] = (process.env.GITHUB_REPOSITORY || "").split('/');
            const [hbOwner, hbRepo] = core.getInput("repository", { required: true }).split('/');
            let formulaPath = core.getInput("formula");
            if (formulaPath.length == 0) {
                if (appRepo == "") {
                    core.setFailed('failed to get formula path');
                    return;
                }
                formulaPath = path.join("Formula", `${appRepo}.rb`);
            }
            core.debug(`Check ${formulaPath} in ${hbOwner}/${hbRepo}`);
            const octokit = new github.GitHub(releaseGhToken);
            const { data } = yield octokit.repos.getContents({
                owner: hbOwner,
                repo: hbRepo,
                path: formulaPath,
            });
            core.debug(`Get contents result: ${data}`);
            if (Array.isArray(data) || data.type != "file") {
                core.setFailed(`${formulaPath} in ${hbOwner}/${hbRepo} is not a file`);
                return;
            }
            const tempDir = '/home/actions/temp';
            const tempFormulaPath = path.join(tempDir, path.basename(formulaPath));
            let maltmillArgs = [`-token=${ghToken}`];
            if (data.content == null) {
                maltmillArgs = [
                    'new',
                    ...maltmillArgs,
                    '-w',
                    `${appOwner}/${appRepo}`,
                ];
            }
            else {
                fs.writeFileSync(tempFormulaPath, new Buffer(data.content, 'base64'));
                maltmillArgs = [
                    ...maltmillArgs,
                    '-w',
                    tempFormulaPath,
                ];
            }
            const maltmillVersion = core.getInput('maltmill-version');
            const maltmillPath = yield getMaltmillPath(maltmillVersion);
            yield exec.exec(maltmillPath, maltmillArgs);
            yield octokit.repos.createOrUpdateFile({
                owner: hbOwner,
                repo: hbRepo,
                path: formulaPath,
                message: `Bump ${appOwner}/${appRepo} formula`,
                content: fs.readFileSync(tempFormulaPath, 'base64'),
                sha: data.sha,
            });
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
function getMaltmillPath(version) {
    return __awaiter(this, void 0, void 0, function* () {
        const toolPath = tc.find('maltmill', version) || (yield downloadMaltmill(version));
        core.debug(`contained entries: ${fs.readdirSync(toolPath)}`);
        return path.join(toolPath, "maltmill");
    });
}
function downloadMaltmill(version) {
    return __awaiter(this, void 0, void 0, function* () {
        const archivePath = yield tc.downloadTool(getUrl(version));
        const extractedPath = yield tc.extractTar(archivePath);
        const toolPath = path.join(extractedPath, getArchiveName(version));
        const cachePath = yield tc.cacheDir(toolPath, "maltmill", version);
        core.debug(`maltmill is cached under ${cachePath}`);
        return cachePath;
    });
}
function getUrl(version) {
    return `https://github.com/Songmu/maltmill/releases/download/${version}/${getArchiveName(version)}.tar.gz`;
}
function getArchiveName(version) {
    return `maltmill_${version}_linux_amd64`;
}
run();