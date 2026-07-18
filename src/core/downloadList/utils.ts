import { formatMusicName } from '@/utils/tools'
import { extname, mkdir, existsFile, unlink, privateStorageDirectoryPath, externalStorageDirectoryPath } from '@/utils/fs'
import settingState from '@/store/setting/state'

const SOURCE_FOLDER_NAMES: Record<LX.OnlineSource, string> = {
  kw: '酷我',
  kg: '酷狗',
  tx: '企鹅',
  wy: '网易云',
  mg: '咪咕',
}

export const QUALITY_EXT_MAP: Record<LX.Quality, LX.Download.FileExt> = {
  '128k': 'mp3',
  '192k': 'mp3',
  '320k': 'mp3',
  flac: 'flac',
  flac24bit: 'flac',
  ape: 'ape',
  wav: 'wav',
}

export const QUALITY_LABEL: Record<LX.Quality, string> = {
  '128k': '128K',
  '192k': '192K',
  '320k': '320K',
  flac: '无损 FLAC',
  flac24bit: '无损 FLAC 24bit',
  ape: '无损 APE',
  wav: '无损 WAV',
}

/**
 * 过滤文件名中的非法字符
 */
export const sanitizeFileName = (name: string) => {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}

/**
 * 根据音质返回扩展名
 */
export const getExtByQuality = (quality: LX.Quality): LX.Download.FileExt => {
  return QUALITY_EXT_MAP[quality] ?? 'mp3'
}

/**
 * 构造下载文件名（含扩展名）
 */
export const buildFileName = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality): string => {
  const format = settingState.setting['download.fileName']
  const baseName = sanitizeFileName(formatMusicName(format, musicInfo.name, musicInfo.singer)) || `${musicInfo.id}`
  const ext = getExtByQuality(quality)
  return `${baseName}.${ext}`
}

/**
 * 计算最终下载目录（绝对路径或 content URI 前缀）
 * - 若 savePath 为空：使用应用私有存储 download 子目录
 * - 若 useMrgedFolder=false：在 savePath 下增加按音源命名的子目录
 */
export const buildDownloadDir = (musicInfo: LX.Music.MusicInfoOnline): string => {
  const savePath = settingState.setting['download.savePath']
  const base = savePath || `${privateStorageDirectoryPath}/download`

  if (settingState.setting['download.useMrgedFolder']) return base
  const sourceFolder = SOURCE_FOLDER_NAMES[musicInfo.source as LX.OnlineSource] ?? musicInfo.source
  return `${base}/${sourceFolder}`
}

/**
 * 计算最终下载文件完整路径
 */
export const buildDownloadFilePath = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality): string => {
  return `${buildDownloadDir(musicInfo)}/${buildFileName(musicInfo, quality)}`
}

/**
 * 确保目录存在（Android Scoped URI 形式也支持）
 */
export const ensureDir = async(dirPath: string) => {
  try {
    if (await existsFile(dirPath)) return
    await mkdir(dirPath)
  } catch (err) {
    console.warn('ensureDir failed:', dirPath, err)
  }
}

/**
 * 删除已下载的文件（用于重新下载前清理）
 */
export const removeFile = async(filePath: string) => {
  try {
    if (await existsFile(filePath)) await unlink(filePath)
  } catch (err) {
    console.warn('removeFile failed:', filePath, err)
  }
}

export const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export const formatSpeed = (bytesPerSec: number): string => {
  return `${formatBytes(bytesPerSec)}/s`
}

export { externalStorageDirectoryPath, SOURCE_FOLDER_NAMES }
