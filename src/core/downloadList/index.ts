import downloadListAction from '@/store/downloadList/action'
import { startTask, pauseTask, resumeTask, retryTask, triggerSchedule, onMaxDownloadNumChange } from './task'
import { buildDownloadFilePath, getExtByQuality } from './utils'
import { toast } from '@/utils/tools'

/**
 * 生成下载任务 ID（基于音源+歌曲id+音质，保证唯一）
 */
const buildTaskId = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality) => {
  return `${musicInfo.source}_${musicInfo.id}_${quality}`
}

/**
 * 添加单首歌曲到下载队列
 */
export const addDownload = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality) => {
  console.log('[Download] addDownload called', { id: musicInfo.id, name: musicInfo.name, quality })
  try {
    const id = buildTaskId(musicInfo, quality)
    const list = downloadListAction.getList()
    console.log('[Download] current list length', list.length)
    // 已存在则跳过
    if (list.some(t => t.id === id)) {
      console.log('[Download] task already exists', id)
      toast(global.i18n.t('download_already_exists_tip'))
      return { added: false, id }
    }

    const filePath = buildDownloadFilePath(musicInfo, quality)
    const ext = getExtByQuality(quality)
    console.log('[Download] filePath', filePath)

    const item: LX.Download.ListItem = {
      id,
      isComplate: false,
      status: 'waiting',
      statusText: global.i18n.t('download_status_waiting'),
      downloaded: 0,
      total: 0,
      progress: 0,
      speed: '',
      metadata: {
        musicInfo,
        url: null,
        quality,
        ext,
        fileName: filePath.split('/').pop() ?? `${musicInfo.id}.${ext}`,
        filePath,
      },
    }

    downloadListAction.addTasks([item])
    console.log('[Download] task added, triggering schedule')
    triggerSchedule()
    toast(global.i18n.t('download_added_tip'))
    return { added: true, id }
  } catch (err: any) {
    console.error('[Download] addDownload failed:', err)
    toast(err?.message || global.i18n.t('download_add_failed_tip'))
    return { added: false, id: '' }
  }
}

/**
 * 批量添加下载
 */
export const addBatchDownload = (musicInfos: LX.Music.MusicInfoOnline[], quality: LX.Quality) => {
  if (!musicInfos.length) return { added: 0 }

  try {
    const existingIds = new Set(downloadListAction.getList().map(t => t.id))
    const newItems: LX.Download.ListItem[] = []

    for (const musicInfo of musicInfos) {
      const id = buildTaskId(musicInfo, quality)
      if (existingIds.has(id)) continue
      existingIds.add(id)

      const filePath = buildDownloadFilePath(musicInfo, quality)
      const ext = getExtByQuality(quality)

      newItems.push({
        id,
        isComplate: false,
        status: 'waiting',
        statusText: global.i18n.t('download_status_waiting'),
        downloaded: 0,
        total: 0,
        progress: 0,
        speed: '',
        metadata: {
          musicInfo,
          url: null,
          quality,
          ext,
          fileName: filePath.split('/').pop() ?? `${musicInfo.id}.${ext}`,
          filePath,
        },
      })
    }

    if (newItems.length) {
      downloadListAction.addTasks(newItems)
      triggerSchedule()
      toast(global.i18n.t('download_batch_added_tip', { num: newItems.length }))
    } else {
      toast(global.i18n.t('download_already_exists_tip'))
    }
    return { added: newItems.length }
  } catch (err: any) {
    console.warn('addBatchDownload failed:', err)
    toast(err?.message || global.i18n.t('download_add_failed_tip'))
    return { added: 0 }
  }
}

/**
 * 暂停任务
 */
export const pauseDownload = (id: string) => {
  const item = downloadListAction.getList().find(t => t.id === id)
  if (item) pauseTask(item)
}

/**
 * 恢复任务
 */
export const resumeDownload = (id: string) => {
  const item = downloadListAction.getList().find(t => t.id === id)
  if (item) resumeTask(item)
}

/**
 * 重试任务
 */
export const retryDownload = (id: string) => {
  const item = downloadListAction.getList().find(t => t.id === id)
  if (item) retryTask(item)
}

/**
 * 移除任务（同时停止运行中的下载）
 */
export const removeDownload = (id: string) => {
  pauseDownload(id)
  downloadListAction.removeTask(id)
}

/**
 * 批量移除
 */
export const removeDownloads = (ids: string[]) => {
  for (const id of ids) pauseDownload(id)
  downloadListAction.removeTasks(ids)
}

/**
 * 清空已完成/失败
 */
export const clearCompletedDownloads = () => {
  downloadListAction.clearCompleted()
}

/**
 * 清空全部
 */
export const clearAllDownloads = () => {
  // 停止所有运行中的任务
  const list = downloadListAction.getList()
  for (const item of list) {
    if (item.status === 'run') pauseTask(item)
  }
  downloadListAction.clearAll()
}

export { startTask, retryTask, triggerSchedule, onMaxDownloadNumChange }
