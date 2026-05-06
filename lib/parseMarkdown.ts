import { ParsedSection, StoryImage } from './types'

// Split markdown text into sections by ## headings (but not ###).
// Mirrors the iOS parseMarkdownSections() logic.
// Section IDs are positional (s0, s1, …) so re-parsing the same story
// produces identical keys — React won't remount SectionCard elements.
export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const lines = markdown.split('\n')
  const sections: ParsedSection[] = []
  let currentHeading: string | undefined
  let currentHeadingLink: string | undefined
  let currentLines: string[] = []

  function flush() {
    const content = currentLines.join('\n').trim()
    if (!content) return
    sections.push({
      id: `s${sections.length}`,
      heading: currentHeading,
      headingLink: currentHeadingLink,
      content,
      images: extractImages(content),
    })
  }

  for (const line of lines) {
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      flush()
      const raw = line.slice(3).trim().replace(/\*\*(.+?)\*\*/g, '$1')
      const [text, link] = parseHeadingLink(raw)
      currentHeading = text
      currentHeadingLink = link
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  flush()
  return sections
}

// Rewrites custom link schemes so react-markdown can handle them.
// #nav/path          → data-nav="path"  (encoded in href as nav://path)
// #prompt "message"  → nav://prompt?msg=encoded
// trips/xxx/path     → nav://trips/xxx/path
export function rewriteMarkdownLinks(text: string): string {
  // #nav/path
  text = text.replace(/\]\(#nav\/([^)]+)\)/g, '](nav://$1)')

  // #prompt?query "message"
  text = text.replace(/\]\(#prompt\?([^"]*?)\s*"([^"]+)"\)/g, (_m, query, msg) => {
    const encoded = encodeURIComponent(msg)
    const q = query.trim()
    return q ? `](nav://prompt/${encoded}?${q})` : `](nav://prompt/${encoded})`
  })

  // #prompt "message"
  text = text.replace(/\]\(#prompt\s+"([^"]+)"\)/g, (_m, msg) => {
    return `](nav://prompt/${encodeURIComponent(msg)})`
  })

  // #prompt/message
  text = text.replace(/\]\(#prompt\/([^)]+)\)/g, '](nav://prompt/$1)')

  // Strip link titles: [text](url "title") → [text](url)
  text = text.replace(/\(([^")]+?)\s+"[^"]+"\)/g, '($1)')

  // trips/xxx/path or trips-app/xxx/path
  text = text.replace(/\]\(\/?trips(-app)?\/([^)]+)\)/g, '](nav://trips$1/$2)')

  return text
}

function extractImages(markdown: string): StoryImage[] {
  const images: StoryImage[] = []

  // Linked images: [![alt](img-url)](link-url)
  const linkedRe = /\[!\[.*?\]\((https?:\/\/[^)]+)\)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = linkedRe.exec(markdown)) !== null) {
    images.push({ src: m[1], link: m[2] })
  }

  // Standalone images (skip already-captured linked ones)
  const linkedSrcs = new Set(images.map(i => i.src))
  const standaloneRe = /(?<!\[)!\[.*?\]\((https?:\/\/[^)]+)\)/g
  while ((m = standaloneRe.exec(markdown)) !== null) {
    if (!linkedSrcs.has(m[1])) {
      images.push({ src: m[1] })
    }
  }

  return images
}

function parseHeadingLink(heading: string): [string, string | undefined] {
  const m = heading.match(/\[([^\]]+)\]\(([^)]+)\)/)
  if (!m) return [heading, undefined]
  const displayText = heading.replace(m[0], m[1]).trim()
  return [displayText, m[2]]
}

// Resolve {variable} templates in a path string
export function resolveTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`)
}

// Extract resource paths that should be prefetched from markdown content.
// Mirrors the iOS preloadLinked() regex logic.
export function extractNavPaths(markdown: string): string[] {
  const paths = new Set<string>()

  // #nav/path links
  const navRe = /\]\(#nav\/([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = navRe.exec(markdown)) !== null) {
    paths.add(m[1].split('?')[0])
  }

  // trips/xxx/path or trips-app/xxx/path links
  const tripsRe = /\]\(\/?trips(-app)?\/([^)\s]+)\)/g
  while ((m = tripsRe.exec(markdown)) !== null) {
    paths.add(`trips${m[1] ?? ''}/${m[2].split('?')[0]}`)
  }

  return Array.from(paths)
}
