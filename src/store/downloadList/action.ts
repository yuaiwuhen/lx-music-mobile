import state from './state'
import { saveDownloadList } from '@/utils/data'

const emitChange = () => {
  console.log('[DownloadList] emitChange, list length:', state.list.length, 'items:', state.list.map(t => ({ id: t.id, status: t.status, name: t.metadata.musicInfo.name })))
  saveDownloadList(state.list)
  global.app_event.downloadListUpdate()
}

// 用于启动时恢复持久化数据（不触发持久化写入）
export const hydrate = (items: LX.Download.ListItem[]) => {
  state.list = items
  state.activeTaskIds.clear()
  global.app_event.downloadListUpdate()
}

export default {
  getList() {
    return state.list
  },
  addTasks(items: LX.Download.ListItem[]) {
    if (!items.length) return
    for (const item of items) {
      state.list.unshift(item)
    }
    emitChange()
  },
  removeTask(id: string) {
    const idx = state.list.findIndex(t => t.id === id)
    if (idx < 0) return
    state.list.splice(idx, 1)
    state.activeTaskIds.delete(id)
    emitChange()
  },
  removeTasks(ids: string[]) {
    if (!ids.length) return
    const idSet = new Set(ids)
    state.list = state.list.filter(t => !idSet.has(t.id))
    for (const id of ids) state.activeTaskIds.delete(id)
    emitChange()
  },
  clearCompleted() {
    const removed: string[] = []
    state.list = state.list.filter(t => {
      if (t.status === 'completed' || t.status === 'error') {
        removed.push(t.id)
        state.activeTaskIds.delete(t.id)
        return false
      }
      return true
    })
    if (removed.length) emitChange()
  },
  clearAll() {
    state.list = []
    state.activeTaskIds.clear()
    emitChange()
  },
  updateTask(id: string, patch: Partial<LX.Download.ListItem>) {
    const idx = state.list.findIndex(t => t.id === id)
    if (idx < 0) return
    state.list[idx] = { ...state.list[idx], ...patch, metadata: { ...state.list[idx].metadata, ...(patch.metadata ?? {}) } }
    emitChange()
  },
  updateTaskMetadata(id: string, patch: Partial<LX.Download.ListItem['metadata']>) {
    const idx = state.list.findIndex(t => t.id === id)
    if (idx < 0) return
    state.list[idx].metadata = { ...state.list[idx].metadata, ...patch }
    emitChange()
  },
  setActive(id: string, active: boolean) {
    if (active) state.activeTaskIds.add(id)
    else state.activeTaskIds.delete(id)
  },
  isActive(id: string) {
    return state.activeTaskIds.has(id)
  },
  getActiveCount() {
    return state.activeTaskIds.size
  },
}
