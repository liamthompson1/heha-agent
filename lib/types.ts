export interface StoriesResponse {
  text: string
  title?: string
  childResources?: Record<string, string>
  parentResources?: Record<string, string>
  variables?: Record<string, string>
  modelId?: string
  pageType?: string
}

export interface ConversationResponse {
  conversationId: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface ParsedSection {
  id: string
  heading?: string
  headingLink?: string
  content: string
  images: StoryImage[]
}

export interface StoryImage {
  src: string
  link?: string
}

export interface NavStackEntry {
  path: string
  params: Record<string, string>
  story: StoriesResponse
  sections: ParsedSection[]
}
