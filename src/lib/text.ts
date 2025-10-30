export function cleanText(text: string): string {
  if (!text) return ''

  let s = text
  s = s.normalize("NFKC")
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "")
  s = s.replace(/[\u{1f300}-\u{1f5ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}]/gu, '')
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
  s = s.replace(/https?:\/\/[^\s]+/g, '')
  s = s.replace(/www\.[^\s]+/g, '')
  s = s.replace(/[_*~`]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()

  return s
}
