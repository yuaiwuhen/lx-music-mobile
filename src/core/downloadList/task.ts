import { getMusicUrl } from '@/core/music/online'
import { downloadFile, stopDownload, moveFile, temporaryDirectoryPath } from '@/utils/fs'
import { buildDownloadFilePath, buildDownloadDir, ensureDir, removeFile, formatSpeed } from './utils'
import downloadListAction from '@/store/downloadList/action'
import settingState from '@/store/setting/state'
import { toast } from '@/utils/tools'

interface RunningJob {
  jobId: number
  lastTime: number
  lastBytes: number
}

const runningJobs = new Map<string, RunningJob>()

// RNFS 不支持写入 Android Scoped URI（content://...），需要先下到私有目录临时文件，再用 FileSystem.mv 移到目标 URI
const isScopedUri = (path: string) => path.startsWith('content://')

// 为 Scoped URI 目标构造一个私有目录下的临时文件路径
const buildTempFilePath = (taskId: string, ext: string) => {
  return `${temporaryDirectoryPath}/lx_download_${taskId}.${ext}`
}

/**
 * 启动单个下载任务（实际执行）
 */
export const startTask = async(item: LX.Download.ListItem) => {
  if (downloadListAction.isActive(item.id)) return
  downloadListAction.setActive(item.id, true)

  downloadListAction.updateTask(item.id, {
    status: 'run',
    statusText: global.i18n.t('download_status_preparing'),
  })

  let url: string
  try {
    url = await getMusicUrl({
      musicInfo: item.metadata.musicInfo,
      quality: item.metadata.quality,
      isRefresh: true,
      allowToggleSource: true,
      onToggleSource: (newMusicInfo) => {
        if (newMusicInfo) {
          downloadListAction.updateTask(item.id, {
            statusText: global.i18n.t('download_status_toggling_source'),
          })
        }
      },
    })
  } catch (err: any) {
    console.warn('getMusicUrl failed:', err)
    const errMsg = err?.message || global.i18n.t('download_status_failed')
    downloadListAction.updateTask(item.id, {
      status: 'error',
      statusText: errMsg,
    })
    downloadListAction.setActive(item.id, false)
    toast(global.i18n.t('download_failed_tip', { name: item.metadata.musicInfo.name, reason: errMsg }))
    scheduleNext()
    return
  }

  // 更新 URL
  downloadListAction.updateTaskMetadata(item.id, { url })

  const targetFilePath = item.metadata.filePath || buildDownloadFilePath(item.metadata.musicInfo, item.metadata.quality)
  const dir = buildDownloadDir(item.metadata.musicInfo)
  await ensureDir(dir)

  // 若目标文件已存在（断点续传或重复下载），先清理
  await removeFile(targetFilePath)

  // RNFS 不能直接写 content:// URI，需要先下到临时文件再移动
  const useScopedWorkaround = isScopedUri(targetFilePath)
  const downloadTargetPath = useScopedWorkaround
    ? buildTempFilePath(item.id, item.metadata.ext)
    : targetFilePath
  // 清理可能存在的旧临时文件
  if (useScopedWorkaround) await removeFile(downloadTargetPath)

  downloadListAction.updateTask(item.id, {
    statusText: global.i18n.t('download_status_downloading'),
  })

  const startTime = Date.now()
  const job = downloadFile(url, downloadTargetPath, {
    progressInterval: 500,
    begin: (res) => {
      const total = res.contentLength || 0
      downloadListAction.updateTask(item.id, {
        total,
        downloaded: 0,
        progress: 0,
        speed: '0 KB/s',
      })
    },
    progress: (res) => {
      const now = Date.now()
      const total = res.contentLength || 0
      const downloaded = res.bytesWritten
      const progress = total ? Math.floor((downloaded / total) * 100) : 0

      let speed = '0 KB/s'
      const prev = runningJobs.get(item.id)
      if (prev) {
        const dt = now - prev.lastTime
        if (dt > 0) {
          const dBytes = downloaded - prev.lastBytes
          speed = formatSpeed(Math.max(0, Math.floor(dBytes * 1000 / dt)))
        }
        prev.lastTime = now
        prev.lastBytes = downloaded
      }

      downloadListAction.updateTask(item.id, {
        total,
        downloaded,
        progress,
        speed,
        statusText: global.i18n.t('download_status_downloading'),
      })
    },
  })

  runningJobs.set(item.id, {
    jobId: job.jobId,
    lastTime: startTime,
    lastBytes: 0,
  })

  try {
    const result = await job.promise
    runningJobs.delete(item.id)

    if (result.statusCode >= 200 && result.statusCode < 300) {
      // 如果走了 Scoped URI 中转，需要把临时文件移到目标 URI
      if (useScopedWorkaround) {
        try {
          await moveFile(downloadTargetPath, targetFilePath)
        } catch (err: any) {
          console.warn('moveFile to scoped URI failed:', err)
          // 移动失败：清理临时文件
          await removeFile(downloadTargetPath)
          downloadListAction.updateTask(item.id, {
            status: 'error',
            statusText: err?.message || global.i18n.t('download_status_failed'),
          })
          return
        }
      }
      // 下载完成：将 downloaded 同步为 total，避免 UI 显示 "6.0 MB / 9.3 MB" 这类不一致状态
      const latestItem = downloadListAction.getList().find(t => t.id === item.id)
      downloadListAction.updateTask(item.id, {
        status: 'completed',
        isComplate: true,
        progress: 100,
        downloaded: latestItem?.total ?? item.total,
        total: latestItem?.total ?? item.total,
        statusText: global.i18n.t('download_status_completed'),
        speed: '',
      })
    } else {
      downloadListAction.updateTask(item.id, {
        status: 'error',
        statusText: global.i18n.t('download_status_failed_code', { code: result.statusCode }),
      })
      // 清理半成品文件（含临时文件）
      void removeFile(targetFilePath)
      if (useScopedWorkaround) void removeFile(downloadTargetPath)
    }
  } catch (err: any) {
    console.warn('downloadFile failed:', err)
    runningJobs.delete(item.id)
    downloadListAction.updateTask(item.id, {
      status: 'error',
      statusText: err?.message || global.i18n.t('download_status_failed'),
    })
    void removeFile(targetFilePath)
    if (useScopedWorkaround) void removeFile(downloadTargetPath)
  } finally {
    downloadListAction.setActive(item.id, false)
    scheduleNext()
  }
}

/**
 * 暂停任务（停止 RNFS 下载任务，状态置为 pause）
 */
export const pauseTask = (item: LX.Download.ListItem) => {
  const job = runningJobs.get(item.id)
  if (job) {
    try { stopDownload(job.jobId) } catch (err) { /* ignore */ }
    runningJobs.delete(item.id)
  }
  downloadListAction.setActive(item.id, false)
  downloadListAction.updateTask(item.id, {
    status: 'pause',
    statusText: global.i18n.t('download_status_paused'),
  })
}

/**
 * 恢复任务（重新启动下载，从 0 开始；RNFS 在 content:// URI 下不支持断点续传）
 */
export const resumeTask = (item: LX.Download.ListItem) => {
  void startTask(item)
}

/**
 * 重试任务
 */
export const retryTask = (item: LX.Download.ListItem) => {
  void startTask(item)
}

/**
 * 调度下一个等待中的任务
 */
const scheduleNext = () => {
  const max = settingState.setting['download.maxDownloadNum'] || 3
  const activeCount = downloadListAction.getActiveCount()
  if (activeCount >= max) return

  const list = downloadListAction.getList()
  const next = list.find(t => t.status === 'waiting' && !downloadListAction.isActive(t.id))
  if (next) {
    void startTask(next)
  }
}

/**
 * 触发调度（外部添加任务后调用）
 */
export const triggerSchedule = () => {
  scheduleNext()
}

/**
 * 应用设置变更时，重新调度
 */
export const onMaxDownloadNumChange = () => {
  scheduleNext()
}
