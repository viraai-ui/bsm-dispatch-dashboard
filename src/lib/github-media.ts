import { githubRequest } from './workflow-store'

function mediaConfig() {
  return {
    owner: process.env.GITHUB_OWNER || 'viraai-ui',
    repo: process.env.GITHUB_REPO || 'bsm-dispatch-dashboard',
    branch: process.env.GITHUB_BRANCH || 'main',
  }
}

function cleanSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video'
}

export async function uploadBufferToGithubMedia(fileName: string, buffer: Buffer, mimeType: string) {
  const { owner, repo, branch } = mediaConfig()
  const safeName = cleanSegment(fileName)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `data/media-uploads/${stamp}-${safeName}`
  const content = buffer.toString('base64')
  await githubRequest(`/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Upload media proof ${safeName}`, content, branch }),
  })
  return {
    fileId: `github:${path}`,
    url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
    storedInWorkDrive: false,
    mimeType,
  }
}
