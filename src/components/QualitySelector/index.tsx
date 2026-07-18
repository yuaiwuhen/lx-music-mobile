import { useImperativeHandle, forwardRef, useState, useMemo, useRef } from 'react'
import { View, TouchableOpacity, ScrollView } from 'react-native'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { QUALITY_LABEL } from '@/core/downloadList/utils'
import settingState from '@/store/setting/state'

const QUALITY_ORDER: LX.Quality[] = ['flac24bit', 'flac', '320k', '192k', '128k', 'ape', 'wav']

export interface QualitySelectorType {
  show: (musicInfos: LX.Music.MusicInfoOnline[], onConfirm: (quality: LX.Quality) => void) => void
}

export default forwardRef<QualitySelectorType>((_, ref) => {
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  const [musicInfos, setMusicInfos] = useState<LX.Music.MusicInfoOnline[]>([])
  const onConfirmRef = useRef<((quality: LX.Quality) => void) | null>(null)

  useImperativeHandle(ref, () => ({
    show(infos, onConfirm) {
      console.log('[QualitySelector] show called', { count: infos.length, first: infos[0] })
      setMusicInfos(infos)
      onConfirmRef.current = onConfirm
      dialogRef.current?.setVisible(true)
    },
  }))

  // 取所有歌曲都支持的音质交集；单曲则用其自身支持音质
  const availableQualities = useMemo(() => {
    if (!musicInfos.length) return [] as LX.Quality[]
    let set: Set<LX.Quality> | null = null
    for (const info of musicInfos) {
      // 优先用 _qualitys 对象，其次用 qualitys 数组
      let qs: LX.Quality[]
      if (info.meta._qualitys && Object.keys(info.meta._qualitys).length) {
        qs = Object.keys(info.meta._qualitys) as LX.Quality[]
      } else if (info.meta.qualitys && info.meta.qualitys.length) {
        qs = info.meta.qualitys.map((q: any) => q.type) as LX.Quality[]
      } else {
        // 都没有的话，默认给几个常见音质，让用户可以选
        qs = ['128k', '320k', 'flac']
      }
      // 过滤掉音源脚本不支持的音质（避免选了 320k/flac 但音源只支持 128k 导致请求 404）
      const sourceSupported = global.lx.qualityList[info.source]
      if (sourceSupported && sourceSupported.length) {
        qs = qs.filter(qt => (sourceSupported as LX.Quality[]).includes(qt))
        // 若全部被过滤掉，回退到音源声明支持的音质
        if (!qs.length) qs = [...sourceSupported] as LX.Quality[]
      }
      const filtered = qs.filter(qt => QUALITY_ORDER.includes(qt))
      if (!set) set = new Set(filtered)
      else {
        const next = new Set<LX.Quality>()
        for (const qt of filtered) if (set.has(qt)) next.add(qt)
        set = next
      }
    }
    const list = Array.from(set ?? [])
    // 按 QUALITY_ORDER 排序（高质量在前）
    list.sort((a, b) => QUALITY_ORDER.indexOf(a) - QUALITY_ORDER.indexOf(b))
    return list
  }, [musicInfos])

  // 单曲时显示每个音质的 size
  const sizeMap = useMemo(() => {
    const map: Partial<Record<LX.Quality, string>> = {}
    if (musicInfos.length === 1) {
      const info = musicInfos[0]
      const qs = info.meta._qualitys
      if (qs) {
        for (const key of Object.keys(qs) as LX.Quality[]) {
          const v = qs[key]
          if (v?.size) map[key] = v.size
        }
      }
    }
    return map
  }, [musicInfos])

  const defaultQuality = settingState.setting['download.quality']

  const handleSelect = (quality: LX.Quality) => {
    console.log('[QualitySelector] handleSelect', quality)
    dialogRef.current?.setVisible(false)
    console.log('[QualitySelector] onConfirmRef.current exists?', !!onConfirmRef.current)
    onConfirmRef.current?.(quality)
    onConfirmRef.current = null
  }

  const title = musicInfos.length > 1
    ? global.i18n.t('download_quality_title_batch', { num: musicInfos.length })
    : global.i18n.t('download_quality_title_single')

  return (
    <Dialog ref={dialogRef} title={title} bgHide>
      <View style={styles.container}>
        {availableQualities.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text color={theme['c-font-label']}>{global.i18n.t('download_quality_empty')}</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {availableQualities.map(quality => {
              const isDefault = quality === defaultQuality
              const size = sizeMap[quality]
              return (
                <TouchableOpacity
                  key={quality}
                  style={{ ...styles.item, backgroundColor: theme['c-primary-light-100-alpha-100'] }}
                  onPress={() => handleSelect(quality)}
                >
                  <View style={styles.itemLeft}>
                    <Text size={14} color={theme['c-font']}>
                      {QUALITY_LABEL[quality] ?? quality}
                      {isDefault ? `  (${global.i18n.t('download_quality_default')})` : ''}
                    </Text>
                  </View>
                  {size ? (
                    <Text size={12} color={theme['c-font-label']}>{size}</Text>
                  ) : null}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>
    </Dialog>
  )
})

const styles = createStyle({
  container: {
    minWidth: scaleSizeH(260),
    maxHeight: scaleSizeH(360),
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: 5,
  },
  emptyWrap: {
    padding: 20,
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    marginVertical: 2,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})
