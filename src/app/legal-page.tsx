import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import Link from "next/link";

type LegalDocument = "privacy-policy.md" | "support.md" | "terms-of-use.md";
type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

export function LegalPage({ document }: { document: LegalDocument }) {
  const markdown = readFileSync(
    path.join(process.cwd(), "docs", "legal", document),
    "utf8",
  );

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-stone-900 sm:px-6 sm:py-12">
      <article className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white/90 px-5 py-7 shadow-sm sm:px-10 sm:py-10">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl text-sm font-extrabold text-violet-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
        >
          First Move: Start Small
        </Link>
        <div className="mt-5 space-y-4">
          {parseBlocks(markdown).map((block, index) => renderBlock(block, index))}
        </div>
        <nav
          aria-label="Legal and support"
          className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-200 pt-6 text-sm font-bold"
        >
          <Link className="text-violet-700 hover:underline" href="/privacy">Privacy Policy</Link>
          <Link className="text-violet-700 hover:underline" href="/terms">Terms of Use</Link>
          <Link className="text-violet-700 hover:underline" href="/support">Support</Link>
        </nav>
      </article>
    </main>
  );
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: Extract<Block, { kind: "list" }> | undefined;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = undefined;
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const unordered = /^-\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
    } else if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) flushList();
      list ??= { kind: "list", ordered: isOrdered, items: [] };
      list.items.push((ordered ?? unordered)![1]);
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.kind === "heading") {
    if (block.level === 1) {
      return <h1 key={key} className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">{inline(block.text)}</h1>;
    }
    if (block.level === 2) {
      return <h2 key={key} className="pt-5 text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">{inline(block.text)}</h2>;
    }
    return <h3 key={key} className="pt-3 text-lg font-extrabold text-stone-900">{inline(block.text)}</h3>;
  }

  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List key={key} className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-2 pl-6 leading-7 text-stone-700`}>
        {block.items.map((item, index) => <li key={index}>{inline(item)}</li>)}
      </List>
    );
  }

  return <p key={key} className="leading-7 text-stone-700">{inline(block.text)}</p>;
}

function inline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|https:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|  \n|\n)/g);
  return tokens.filter(Boolean).map((token, index) => {
    if (token === "  \n" || token === "\n") return <br key={index} />;
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("https://")) return <a key={index} className="break-words font-semibold text-violet-700 underline underline-offset-2" href={token}>{token}</a>;
    if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(token)) return <a key={index} className="break-words font-semibold text-violet-700 underline underline-offset-2" href={`mailto:${token}`}>{token}</a>;
    return token;
  });
}
