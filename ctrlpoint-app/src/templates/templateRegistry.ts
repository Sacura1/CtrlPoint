export type TemplateCategory = 'trending' | 'fun' | 'useful'
export type TemplateIcon =
  | 'bird'
  | 'brain'
  | 'briefcase'
  | 'cake'
  | 'footprints'
  | 'gamepad'
  | 'gift'
  | 'heart'
  | 'joystick'
  | 'link'
  | 'megaphone'
  | 'message'
  | 'party'
  | 'puzzle'
  | 'rabbit'
  | 'shield'
  | 'sword'
  | 'trophy'

export type TemplateField =
  | {
      id: string
      label: string
      type: 'text' | 'textarea' | 'date'
      placeholder?: string
      required?: boolean
    }
  | {
      id: string
      label: string
      type: 'select'
      options: string[]
      allowCustom?: boolean
      required?: boolean
    }
  | {
      id: string
      label: string
      type: 'images'
      max: number
      required?: boolean
    }

export interface BuildTemplate {
  id: string
  title: string
  short: string
  category: Exclude<TemplateCategory, 'trending'>
  tags: string[]
  trending?: boolean
  accent: string
  icon: TemplateIcon
  fields: TemplateField[]
  prompt: string
}

export interface TemplateImage {
  uri: string
  dataUri: string
}

export type TemplateValues = Record<string, string | TemplateImage[] | undefined>

export type TemplateAssets = Record<string, string>

export const BUILD_TEMPLATES: BuildTemplate[] = [
  {
    id: 'flappy-game',
    title: 'Flappy Game',
    short: 'A simple tap-to-fly game with custom name and theme.',
    category: 'fun',
    tags: ['Game', 'Simple'],
    trending: true,
    accent: '#38bdf8',
    icon: 'bird',
    fields: [
      { id: 'gameName', label: 'Game name', type: 'text', placeholder: 'Sky Dash', required: true },
      { id: 'heroName', label: 'Character name', type: 'text', placeholder: 'Blinky' },
      { id: 'style', label: 'Style', type: 'select', options: ['Retro', 'Cute', 'Neon'], allowCustom: true, required: true },
      { id: 'photo', label: 'Character image', type: 'images', max: 1 },
    ],
    prompt: 'Create a mobile-friendly Flappy Bird style tap game.',
  },
  {
    id: 'tap-runner',
    title: 'Tap Runner',
    short: 'A fast endless runner where players tap to jump obstacles.',
    category: 'fun',
    tags: ['Game'],
    accent: '#facc15',
    icon: 'footprints',
    fields: [
      { id: 'gameName', label: 'Game name', type: 'text', placeholder: 'Lagos Rush', required: true },
      { id: 'character', label: 'Main character', type: 'text', placeholder: 'Zara' },
      { id: 'world', label: 'World', type: 'select', options: ['City', 'Space', 'Jungle'], allowCustom: true, required: true },
    ],
    prompt: 'Create a mobile-friendly endless runner tap game.',
  },
  {
    id: 'memory-match',
    title: 'Memory Match',
    short: 'A polished card matching game using names, icons, or photos.',
    category: 'fun',
    tags: ['Game', 'Photos'],
    accent: '#a78bfa',
    icon: 'puzzle',
    fields: [
      { id: 'gameName', label: 'Game name', type: 'text', placeholder: 'Couple Match', required: true },
      { id: 'theme', label: 'Theme', type: 'select', options: ['Love', 'Birthday', 'Football'], allowCustom: true, required: true },
      { id: 'photos', label: 'Photos', type: 'images', max: 6 },
    ],
    prompt: 'Create a mobile-friendly memory card matching game.',
  },
  {
    id: 'quiz-game',
    title: 'Quiz Game',
    short: 'A quick trivia game with score, rounds, and custom topic.',
    category: 'fun',
    tags: ['Game', 'Quiz'],
    accent: '#fb923c',
    icon: 'brain',
    fields: [
      { id: 'gameName', label: 'Game name', type: 'text', placeholder: 'Who Knows Me?', required: true },
      { id: 'topic', label: 'Topic', type: 'text', placeholder: 'Questions about me', required: true },
      { id: 'difficulty', label: 'Difficulty', type: 'select', options: ['Easy', 'Funny', 'Hard'], allowCustom: true },
      { id: 'details', label: 'Questions or facts', type: 'textarea', placeholder: 'Optional facts the quiz should use.' },
    ],
    prompt: 'Create a mobile-friendly quiz game with scoring.',
  },
  {
    id: 'birthday-wish',
    title: 'Birthday Wish',
    short: 'A personal birthday page with photos, message, and motion.',
    category: 'fun',
    tags: ['Popular'],
    trending: true,
    accent: '#f472b6',
    icon: 'cake',
    fields: [
      { id: 'name', label: 'Who is it for?', type: 'text', placeholder: 'Stacy', required: true },
      { id: 'tone', label: 'Tone', type: 'select', options: ['Sweet', 'Funny', 'Luxury'], allowCustom: true, required: true },
      { id: 'photos', label: 'Photos', type: 'images', max: 5 },
      { id: 'message', label: 'Message', type: 'textarea', placeholder: 'Optional personal message' },
    ],
    prompt: 'Create a personalized birthday wish website.',
  },
  {
    id: 'ask-out',
    title: 'Ask Out',
    short: 'A cute page to ask someone out with a memorable reveal.',
    category: 'fun',
    tags: ['Fun'],
    trending: true,
    accent: '#fb7185',
    icon: 'heart',
    fields: [
      { id: 'theirName', label: 'Their name', type: 'text', placeholder: 'Maya', required: true },
      { id: 'yourName', label: 'Your name', type: 'text', placeholder: 'Alex' },
      { id: 'vibe', label: 'Vibe', type: 'select', options: ['Cute', 'Funny', 'Dramatic'], allowCustom: true, required: true },
      { id: 'photo', label: 'Photo', type: 'images', max: 1 },
      { id: 'note', label: 'Extra note', type: 'textarea', placeholder: 'Optional inside joke or memory' },
    ],
    prompt: 'Create a playful ask-out website.',
  },
  {
    id: 'game-tournament',
    title: 'Game Tournament',
    short: 'A shareable tournament page for rules, prizes, schedule, and entry details.',
    category: 'fun',
    tags: ['Trending', 'Event'],
    trending: true,
    accent: '#34d399',
    icon: 'trophy',
    fields: [
      { id: 'eventName', label: 'Tournament name', type: 'text', placeholder: 'Weekend Clash', required: true },
      { id: 'game', label: 'Game or activity', type: 'text', placeholder: 'EA FC, Chess, COD Mobile...', required: true },
      { id: 'date', label: 'Date', type: 'date', placeholder: '2026-07-19', required: true },
      { id: 'style', label: 'Style', type: 'select', options: ['Esports', 'Street', 'Premium'], allowCustom: true, required: true },
      { id: 'details', label: 'Details', type: 'textarea', placeholder: 'Prize, venue, entry fee, rules, WhatsApp/Discord link...' },
    ],
    prompt:
      'Create a static game tournament landing page. It must not require a backend, database, accounts, live scores, or live registration. Include polished sections for tournament title, game, date, prize, rules, schedule/bracket preview, and a clear join/contact CTA from the supplied details.',
  },
  {
    id: 'love-letter',
    title: 'Love Letter',
    short: 'A heartfelt page with reveal moments and private-feeling copy.',
    category: 'fun',
    tags: ['Personal'],
    accent: '#c084fc',
    icon: 'heart',
    fields: [
      { id: 'name', label: 'Who is it for?', type: 'text', placeholder: 'Ella', required: true },
      { id: 'tone', label: 'Tone', type: 'select', options: ['Soft', 'Poetic', 'Playful'], allowCustom: true, required: true },
      { id: 'photos', label: 'Photos', type: 'images', max: 4 },
      { id: 'message', label: 'Your message', type: 'textarea', placeholder: 'Write a few lines, or leave blank for AI.' },
    ],
    prompt: 'Create a romantic static love letter website.',
  },
  {
    id: 'apology-page',
    title: 'Apology Page',
    short: 'A sincere apology page that feels personal, not cheesy.',
    category: 'fun',
    tags: ['Personal'],
    accent: '#60a5fa',
    icon: 'message',
    fields: [
      { id: 'name', label: 'Who is it for?', type: 'text', placeholder: 'Sam', required: true },
      { id: 'tone', label: 'Tone', type: 'select', options: ['Sincere', 'Gentle', 'Light'], allowCustom: true, required: true },
      { id: 'reason', label: 'What happened?', type: 'textarea', placeholder: 'Keep it short. AI will make it respectful.', required: true },
      { id: 'photo', label: 'Photo', type: 'images', max: 1 },
    ],
    prompt: 'Create a sincere apology website.',
  },
  {
    id: 'party-invite',
    title: 'Party Invite',
    short: 'A shareable invite with date, place, and RSVP links.',
    category: 'fun',
    tags: ['Event'],
    accent: '#f59e0b',
    icon: 'party',
    fields: [
      { id: 'eventName', label: 'Event name', type: 'text', placeholder: 'Tolu turns 25', required: true },
      { id: 'date', label: 'Date', type: 'date', placeholder: '2026-08-16', required: true },
      { id: 'location', label: 'Location', type: 'text', placeholder: 'Lagos, Nigeria' },
      { id: 'vibe', label: 'Vibe', type: 'select', options: ['Chill', 'Luxury', 'Loud'], allowCustom: true },
      { id: 'photos', label: 'Photos', type: 'images', max: 3 },
    ],
    prompt: 'Create a static party invitation website.',
  },
  {
    id: 'link-in-bio',
    title: 'Link-in-bio',
    short: 'A clean personal page for links, social proof, and contact.',
    category: 'useful',
    tags: ['Useful'],
    accent: '#14b8a6',
    icon: 'link',
    fields: [
      { id: 'name', label: 'Name or brand', type: 'text', placeholder: 'CtrlPoint Studio', required: true },
      { id: 'bio', label: 'Short bio', type: 'textarea', placeholder: 'What should visitors know?' },
      { id: 'style', label: 'Style', type: 'select', options: ['Minimal', 'Creator', 'Premium'], allowCustom: true },
      { id: 'photo', label: 'Profile image', type: 'images', max: 1 },
      { id: 'links', label: 'Links', type: 'textarea', placeholder: 'Instagram: ...\nX: ...\nWebsite: ...' },
    ],
    prompt: 'Create a static link-in-bio website.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio',
    short: 'A simple portfolio that looks polished on mobile.',
    category: 'useful',
    tags: ['Work'],
    accent: '#a3e635',
    icon: 'briefcase',
    fields: [
      { id: 'name', label: 'Name', type: 'text', placeholder: 'Jane Doe', required: true },
      { id: 'role', label: 'Role', type: 'text', placeholder: 'Product designer' },
      { id: 'style', label: 'Style', type: 'select', options: ['Clean', 'Bold', 'Editorial'], allowCustom: true },
      { id: 'photo', label: 'Photo', type: 'images', max: 1 },
      { id: 'details', label: 'Projects or highlights', type: 'textarea', placeholder: 'List 2-4 things to show.' },
    ],
    prompt: 'Create a concise static portfolio website.',
  },
  {
    id: 'product-waitlist',
    title: 'Product Waitlist',
    short: 'A lightweight launch page with a clear call to action.',
    category: 'useful',
    tags: ['Launch'],
    accent: '#f97316',
    icon: 'megaphone',
    fields: [
      { id: 'product', label: 'Product name', type: 'text', placeholder: 'Pocket Studio', required: true },
      { id: 'audience', label: 'Who is it for?', type: 'text', placeholder: 'mobile creators' },
      { id: 'style', label: 'Style', type: 'select', options: ['Premium', 'Playful', 'Technical'], allowCustom: true },
      { id: 'details', label: 'What does it do?', type: 'textarea', placeholder: 'Short notes are enough.' },
    ],
    prompt: 'Create a static product waitlist landing page.',
  },
]

export function templatesForCategory(category: TemplateCategory) {
  if (category === 'trending') return BUILD_TEMPLATES.filter((template) => template.trending)
  return BUILD_TEMPLATES.filter((template) => template.category === category)
}

export function buildTemplatePrompt(template: BuildTemplate, values: TemplateValues) {
  const details = template.fields
    .map((field) => {
      const value = values[field.id]
      if (!value) return ''
      if (field.type === 'images') {
        const images = Array.isArray(value) ? value : []
        if (images.length === 0) return ''
        return `${field.label}: ${images.length} uploaded image${images.length === 1 ? '' : 's'} named ${field.id}.`
      }
      return `${field.label}: ${String(value).trim()}`
    })
    .filter(Boolean)
    .join('\n')

  const imageData = template.fields
    .filter((field) => field.type === 'images')
    .flatMap((field) => {
      const images = values[field.id]
      if (!Array.isArray(images)) return []
      return images.filter((image) => image.dataUri).map((_, index) => `${field.id}_${index + 1}: CTRLPOINT_IMAGE_${field.id}_${index + 1}`)
    })
    .join('\n')

  const templateSpecificRequirements =
    template.id === 'birthday-wish'
      ? `
Birthday-specific requirements:
- The recipient name must appear visibly in the main hero copy. Do not leave unfinished text such as "Today belongs to" without the name.
- The page should read like a finished birthday experience for the recipient, not a card generator or sharing instruction page.
- Do not add "copy birthday text", "share this", "made with", or similar utility/instruction content.
- If you use cake, candle, balloon, or gift visuals, they must be fully contained and never clipped by their card/container on a 390px-wide mobile viewport.
- Prioritize personal message, uploaded photos, tasteful motion, and one polished visual moment over many generic sections.`
      : template.id === 'game-tournament'
        ? `
Tournament-specific requirements:
- This is a static tournament announcement/landing page, not tournament-management software.
- Do not include live registration forms, account creation, admin panels, database features, live brackets, or live score updating.
- Use the provided details for rules, date, prize, contact/join link, and a decorative bracket/schedule preview.`
        : ''

  return `Build from CtrlPoint mobile template: ${template.title}

Template goal:
${template.prompt}

User details:
${details || 'No extra details provided.'}

${imageData ? `Uploaded image placeholders. Use these exact placeholder strings as img src values where relevant:\n${imageData}` : 'No images were uploaded. Create tasteful CSS/inline-SVG visuals instead.'}

${templateSpecificRequirements}

Hard requirements:
- Output one complete static HTML file only.
- No login, sign-up, database, backend, server endpoint, analytics, or fake form submission.
- If contact/RSVP is explicitly needed, use mailto, WhatsApp-style links, or local-only interactions.
- Keep the visible page lean and emotional. Do not add generic sections, feature grids, implementation notes, FAQs, or long explanatory copy unless the template specifically needs them.
- Make the page feel custom to the provided names/details, not like a reusable template.
- Do not add CtrlPoint/platform meta content, "made with" footers, "share this" instructions, "copy text" buttons, or generic CTA buttons unless the user's template fields explicitly ask for them.
- For Birthday Wish, Ask Out, Love Letter, and Apology templates: build the recipient-facing page itself. The visitor should see the message/experience, not instructions about sharing or copying it.
- Use a distinctive layout and visual direction that differs from common AI landing pages.
- For game templates, build the playable game directly in one HTML file with vanilla JavaScript, touch controls, score/restart states, and no external assets unless uploaded images were provided.
- For game templates, Play/Start/Restart must run inside the same page and must work inside a mobile React Native WebView. Do not use window.open, target=_blank, external navigation, blocked browser APIs, browser-only prompts, or hidden iframes for game start.
- For game templates, attach click and touch handlers, make canvas/buttons large enough for thumbs, and prevent page scroll from swallowing game taps.
- Mobile-first, shareable, polished, and ready to deploy.`
}

export function buildTemplateAssets(template: BuildTemplate, values: TemplateValues): TemplateAssets {
  return template.fields
    .filter((field) => field.type === 'images')
    .reduce<TemplateAssets>((assets, field) => {
      const images = values[field.id]
      if (!Array.isArray(images)) return assets
      images.forEach((image, index) => {
        if (image.dataUri) assets[`CTRLPOINT_IMAGE_${field.id}_${index + 1}`] = image.dataUri
      })
      return assets
    }, {})
}
