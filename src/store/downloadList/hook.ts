import { useEffect, useState } from 'react'
import state from './state'

export const useDownloadList = () => {
  const [list, setList] = useState<LX.Download.ListItem[]>(state.list)

  useEffect(() => {
    // 首次挂载时，主动同步一次最新状态（避免事件丢失导致列表不更新）
    console.log('[useDownloadList] mounted, initial list length:', state.list.length)
    setList([...state.list])
    const handleChange = () => {
      console.log('[useDownloadList] handleChange, list length:', state.list.length)
      setList([...state.list])
    }
    global.app_event.on('downloadListUpdate', handleChange)
    // 切换到下载 tab 时也主动同步一次
    const handleNavUpdate = (id: string) => {
      if (id == 'nav_download') {
        console.log('[useDownloadList] nav_download activated, list length:', state.list.length)
        setList([...state.list])
      }
    }
    global.state_event.on('navActiveIdUpdated', handleNavUpdate)
    return () => {
      global.app_event.off('downloadListUpdate', handleChange)
      global.state_event.off('navActiveIdUpdated', handleNavUpdate)
    }
  }, [])

  return list
}

export const useDownloadActiveCount = () => {
  const [count, setCount] = useState(state.activeTaskIds.size)

  useEffect(() => {
    const handleChange = () => {
      setCount(state.activeTaskIds.size)
    }
    global.app_event.on('downloadListUpdate', handleChange)
    return () => {
      global.app_event.off('downloadListUpdate', handleChange)
    }
  }, [])

  return count
}
