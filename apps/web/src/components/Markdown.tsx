import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const Markdown = memo(function Markdown({ text, caret }: { text: string; caret?: boolean }) {
  return (
    <div className={`prose-answer ${caret ? 'caret' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="table-wrap">
              <table>{children}</table>
            </div>
          ),
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
