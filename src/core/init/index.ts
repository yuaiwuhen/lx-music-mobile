import { initSetting, showPactModal, updateSetting } from '@/core/common'
import registerPlaybackService from '@/plugins/player/service'
import initTheme from './theme'
import initI18n from './i18n'
import initUserApi from './userApi'
import initPlayer from './player'
import dataInit from './dataInit'
import initSync from './sync'
import initCommonState from './common'
import { initDeeplink } from './deeplink'
import { setApiSource } from '@/core/apiSource'
import commonActions from '@/store/common/action'
import settingState from '@/store/setting/state'
import { checkUpdate } from '@/core/version'
import { bootLog } from '@/utils/bootLog'
import { cheatTip } from '@/utils/tools'
import { getUserApiList } from '@/utils/data'
import { importUserApi } from '@/core/userApi'
import { httpFetch } from '@/utils/request'

// 调试：自动导入 flower v1 脚本（用户指定的 ghproxy URL）
const FLOWER_V1_URL = 'https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'

const ensureFlowerV1Imported = async (setting: LX.AppSetting) => {
  try {
    const list = await getUserApiList()
    console.log('[init] current user api list:', list.map(a => ({ id: a.id, name: a.name, version: a.version })))

    // 查找 v1 音源（version="1"）
    const v1Api = list.find(a => a.name === '野花🌷' && a.version === '1')
    let targetId: string

    if (v1Api) {
      console.log('[init] flower v1 already imported:', v1Api.id)
      targetId = v1Api.id
    } else {
      // 下载 v1 脚本
      console.log('[init] downloading flower v1 script from ghproxy...')
      const resp = await httpFetch(FLOWER_V1_URL).promise
      const script = resp.body as string
      console.log('[init] downloaded script length:', script.length)

      // 导入
      await importUserApi(script)
      console.log('[init] flower v1 imported')

      // 重新获取列表，找到新导入的 v1
      const newList = await getUserApiList()
      const newV1Api = newList.find(a => a.name === '野花🌷' && a.version === '1')
      if (!newV1Api) {
        console.error('[init] flower v1 not found after import')
        return
      }
      targetId = newV1Api.id
    }

    // 切换到 v1
    if (setting['common.apiSource'] !== targetId) {
      setting['common.apiSource'] = targetId
      updateSetting({ 'common.apiSource': targetId })
      console.log('[init] switched to flower v1:', targetId)
    } else {
      console.log('[init] already using flower v1')
    }
  } catch (err: any) {
    console.error('[init] ensureFlowerV1Imported failed:', err?.message ?? err)
  }
}

let isFirstPush = true
const handlePushedHomeScreen = async() => {
  await cheatTip()
  if (settingState.setting['common.isAgreePact']) {
    if (isFirstPush) {
      isFirstPush = false
      void checkUpdate()
      void initDeeplink()
    }
  } else {
    if (isFirstPush) isFirstPush = false
    showPactModal()
  }
}

let isInited = false
export default async() => {
  console.log('[init] starting, isInited:', isInited)
  if (isInited) return handlePushedHomeScreen
  bootLog('Initing...')
  commonActions.setFontSize(global.lx.fontSize)
  bootLog('Font size changed.')
  const setting = await initSetting()
  bootLog('Setting inited.')
  console.log('[init] setting inited')

  await initTheme(setting)
  bootLog('Theme inited.')
  await initI18n(setting)
  bootLog('I18n inited.')
  console.log('[init] i18n inited')

  await initUserApi(setting)
  bootLog('User Api inited.')
  console.log('[init] userApi inited')

  // 调试：自动导入并切换到 flower v1 音源
  await ensureFlowerV1Imported(setting)

  setApiSource(setting['common.apiSource'])
  bootLog('Api inited.')

  registerPlaybackService()
  bootLog('Playback Service Registered.')
  await initPlayer(setting)
  bootLog('Player inited.')
  console.log('[init] player inited')

  await dataInit(setting)
  bootLog('Data inited.')
  console.log('[init] dataInit done')

  await initCommonState(setting)
  bootLog('Common State inited.')

  void initSync(setting)
  bootLog('Sync inited.')

  // syncSetting()

  isInited ||= true

  return handlePushedHomeScreen
}
