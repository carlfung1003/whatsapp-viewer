import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders model output. Raw HTML stays disabled (react-markdown default) —
// summaries are built from untrusted chat content.
const components: Components = {
  h1: ({ children }) => <h3 className="mt-4 mb-1.5 text-base font-semibold text-zinc-100">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-1.5 text-base font-semibold text-zinc-100">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-zinc-100">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-zinc-200">{children}</h4>,
  p: ({ children }) => <p className="my-2">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={`my-2 space-y-1 ${className?.includes("contains-task-list") ? "pl-1" : "pl-5 list-disc"}`}>
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="my-2 space-y-1 pl-5 list-decimal">{children}</ol>,
  li: ({ children, className }) => (
    <li className={className?.includes("task-list-item") ? "list-none flex gap-2 items-start" : ""}>{children}</li>
  ),
  input: ({ checked }) => (
    <input type="checkbox" checked={!!checked} readOnly className="mt-1 shrink-0 accent-emerald-500" />
  ),
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-3 border-zinc-800" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-emerald-400 underline break-all">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="px-1 py-0.5 rounded bg-zinc-800 font-mono text-[0.85em] break-words">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 p-2 rounded bg-zinc-900 border border-zinc-800 overflow-x-auto text-xs">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-zinc-700 text-zinc-400">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-zinc-800 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-zinc-800 px-2 py-1 align-top">{children}</td>,
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
