import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import * as github from '@actions/github';

async function run() {
  try {
    const ghToken = core.getInput("token", { required: true });
    const releaseGhToken = core.getInput("release-token", { required: true });

    const [appOwner, appRepo] = (process.env.GITHUB_REPOSITORY || "").split('/');
    const [hbOwner, hbRepo] = core.getInput("tap", { required: true }).split('/');

    let formulaPath = core.getInput("formula");
    if (formulaPath.length == 0) {
      if (appRepo == "") {
        core.setFailed('failed to get formula path');
        return
      }
      formulaPath = path.join("Formula", `${appRepo}.rb`)
    }

    core.debug(`Check ${formulaPath} in ${hbOwner}/${hbRepo}`);

    const octokit = new github.GitHub(releaseGhToken);
    const { data } = await octokit.repos.getContents({
      owner: hbOwner,
      repo: hbRepo,
      path: formulaPath,
    });

    core.debug(`Get contents result: ${data}`);

    if (Array.isArray(data) || data.type != "file") {
      core.setFailed(`${formulaPath} in ${hbOwner}/${hbRepo} is not a file`)
      return
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
    } else {
      fs.writeFileSync(tempFormulaPath, new Buffer(data.content, 'base64'));
      maltmillArgs = [
        ...maltmillArgs,
        '-w',
         tempFormulaPath,
      ];
    }

    const maltmillVersion = core.getInput('maltmill-version');
    const maltmillPath = await getMaltmillPath(maltmillVersion);
    await exec.exec(maltmillPath, maltmillArgs);

    let message = core.getInput("commit-message");
    if (message.length == 0) {
      message = `Bump ${appOwner}/${appRepo} formula`;
    }

    await octokit.repos.createOrUpdateFile({
      owner: hbOwner,
      repo: hbRepo,
      path: formulaPath,
      content: fs.readFileSync(tempFormulaPath, 'base64'),
      message,
      sha: data.sha,
      branch: core.getInput("release-branch"),
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function getMaltmillPath(version: string): Promise<string> {
  const toolPath = tc.find('maltmill', version) || await downloadMaltmill(version);
  core.debug(`contained entries: ${fs.readdirSync(toolPath)}`);
  return path.join(toolPath, "maltmill");
}

async function downloadMaltmill(version: string): Promise<string> {
  const archivePath = await tc.downloadTool(getUrl(version));
  const extractedPath = await tc.extractTar(archivePath);
  const toolPath = path.join(extractedPath, getArchiveName(version));
  const cachePath = await tc.cacheDir(toolPath, "maltmill", version);
  core.debug(`maltmill is cached under ${cachePath}`);
  return cachePath;
}

function getUrl(version: string): string {
  return `https://github.com/Songmu/maltmill/releases/download/${version}/${getArchiveName(version)}.tar.gz`
}

function getArchiveName(version: string): string {
  return `maltmill_${version}_linux_amd64`
}

run();