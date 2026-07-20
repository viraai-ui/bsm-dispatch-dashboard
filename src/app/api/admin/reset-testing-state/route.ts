import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { githubReadJson, githubWriteJson } from '@/lib/workflow-store'
import { deleteR2Object } from '@/lib/r2'
import { deleteWorkDriveFile } from '@/lib/workdrive'
import { deleteGithubMediaFile } from '@/lib/github-media'
import type { MediaProofStore, MediaUpload } from '@/lib/media-proof'

export const runtime = 'nodejs'
export const maxDuration = 300

const WORKFLOW_PATH = 'data/workflow-store.json'
const MEDIA_PATH = 'data/media-proof-store.json'
const COMPLETED_PATH = 'data/packaging-completed-store.json'
const DISPATCH_PATH = 'data/dispatch-store.json'
const INITIAL_SERIAL_COUNTER = 262700000

type WorkflowStore = { orders: Record<string, unknown>; serialCounter?: number }
type CompletedStore = { completed: Record<string, unknown> }
type DispatchStore = { dispatched: Record<string, unknown> }

export async function POST() {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response

  const { data: mediaStore } = await githubReadJson<MediaProofStore>(MEDIA_PATH, { records: {} })
  const files = collectMediaFiles(mediaStore)
  const deleteResults = await deleteMediaFiles(files)

  await githubWriteJson<WorkflowStore>(WORKFLOW_PATH, { orders: {}, serialCounter: INITIAL_SERIAL_COUNTER }, 'Reset dispatch workflow testing state')
  await githubWriteJson<CompletedStore>(COMPLETED_PATH, { completed: {} }, 'Reset packaging completed testing state')
  await githubWriteJson<MediaProofStore>(MEDIA_PATH, { records: {} }, 'Reset media proof testing state')
  await githubWriteJson<DispatchStore>(DISPATCH_PATH, { dispatched: {} }, 'Reset dispatch testing state')

  return apiOk({
    reset: true,
    mediaFilesFound: files.length,
    mediaFilesDeleted: deleteResults.deleted,
    mediaDeleteErrors: deleteResults.errors,
  })
}

function collectMediaFiles(store: MediaProofStore) {
  const files: MediaUpload[] = []
  for (const record of Object.values(store.records || {})) {
    for (const unit of Object.values(record.units || {})) {
      files.push(...(unit.photos || []), ...(unit.videos || []))
    }
  }
  return files
}

async function deleteMediaFiles(files: MediaUpload[]) {
  let deleted = 0
  const errors: string[] = []
  const seen = new Set<string>()

  for (const file of files) {
    const identity = file.r2Key || file.workdriveFileId || file.url || file.id
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    try {
      if (file.storageProvider === 'r2' || file.r2Key) {
        const ok = await deleteR2Object(file.r2Key)
        if (ok) deleted += 1
      } else if (file.workdriveFileId) {
        await deleteWorkDriveFile(file.workdriveFileId)
        deleted += 1
      } else if (file.storageProvider === 'github' || file.url) {
        await deleteGithubMediaFile(file.url)
        deleted += 1
      }
    } catch (error) {
      errors.push(`${file.name || identity}: ${error instanceof Error ? error.message : 'delete failed'}`)
    }
  }

  return { deleted, errors }
}
