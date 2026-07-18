const navigation = [
  { label: "Morning", href: "#morning", icon: "sun" },
  { label: "Today", href: "#today", icon: "check" },
  { label: "Focus", href: "#focus", icon: "timer" },
  { label: "Cat", href: "#cat", icon: "cat" },
] as const;

type IconName = (typeof navigation)[number]["icon"];

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    sun: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </>
    ),
    check: <path d="M5 12.5 9.2 17 19 7" />,
    timer: (
      <>
        <circle cx="12" cy="13" r="7.5" />
        <path d="M12 13V9M9.5 2h5M17.5 5.5l1.5-1.5" />
      </>
    ),
    cat: (
      <>
        <path d="m6 8-1-4 4 2a8 8 0 0 1 6 0l4-2-1 4a7 7 0 1 1-12 0Z" />
        <path d="M9 13h.01M15 13h.01M10 16c1.1.7 2.9.7 4 0" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

function PlaceholderCard({
  id,
  eyebrow,
  title,
  description,
  tone,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  tone: "peach" | "mint" | "blue" | "lilac";
}) {
  const tones = {
    peach: "border-orange-200/80 bg-orange-50 text-orange-950",
    mint: "border-emerald-200/80 bg-emerald-50 text-emerald-950",
    blue: "border-sky-200/80 bg-sky-50 text-sky-950",
    lilac: "border-violet-200/80 bg-violet-50 text-violet-950",
  };

  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-[1.75rem] border p-6 shadow-sm sm:p-7 ${tones[tone]}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-60">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-lg text-sm leading-6 opacity-75 sm:text-base">
        {description}
      </p>
      <div
        aria-hidden="true"
        className="mt-8 h-2 w-20 rounded-full bg-current opacity-15"
      />
    </section>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f4ee] text-stone-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-stone-200/80 bg-[#fffdf9]/95 px-6 py-8 backdrop-blur lg:flex lg:flex-col">
        <a
          href="#top"
          className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900"
        >
          <span className="block text-xs font-bold uppercase tracking-[0.22em] text-orange-600">
            First Move
          </span>
          <span className="mt-2 block text-xl font-bold tracking-tight">
            Start small. Feel ready.
          </span>
        </a>

        <nav aria-label="Primary" className="mt-12">
          <ul className="space-y-2">
            {navigation.map((item, index) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  aria-current={index === 0 ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
                    index === 0
                      ? "bg-orange-100 text-orange-950"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
                  }`}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="mt-auto text-xs leading-5 text-stone-500">
          Your day stays on this device.
        </p>
      </aside>

      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-[#f7f4ee]/90 px-5 py-4 backdrop-blur lg:ml-64 lg:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <a
            href="#top"
            className="font-bold tracking-tight focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600 lg:hidden"
          >
            First Move
          </a>
          <p className="hidden text-sm font-medium text-stone-500 lg:block">
            A gentle start to your day
          </p>
          <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-bold shadow-sm">
            <span aria-hidden="true">✦</span> 0 points
          </div>
        </div>
      </header>

      <main
        id="top"
        className="mx-auto max-w-5xl px-5 pb-32 pt-10 sm:px-8 sm:pt-14 lg:ml-64 lg:px-10 lg:pb-16"
      >
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-orange-700">Good morning</p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            What&apos;s your first move?
          </h1>
          <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
            Begin with one small win, then shape the rest of your day at your
            own pace.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5">
          <PlaceholderCard
            id="morning"
            eyebrow="Step one"
            title="Morning check"
            description="Your toothbrush check will live here, with camera, file, and manual options."
            tone="peach"
          />
          <PlaceholderCard
            id="today"
            eyebrow="Plan lightly"
            title="Today"
            description="Daily tasks and habits will be easy to review, edit, reorder, and complete."
            tone="mint"
          />
          <PlaceholderCard
            id="focus"
            eyebrow="One thing"
            title="Focus"
            description="Short presets and a custom timer will help you make a clear, manageable start."
            tone="blue"
          />
          <PlaceholderCard
            id="cat"
            eyebrow="Your companion"
            title="Cat"
            description="Points, treats, toys, and a cozy room for your virtual companion will appear here."
            tone="lilac"
          />
        </div>
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-[#fffdf9]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {navigation.map((item, index) => (
            <li key={item.label}>
              <a
                href={item.href}
                aria-current={index === 0 ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[0.7rem] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-600 ${
                  index === 0 ? "text-orange-700" : "text-stone-500"
                }`}
              >
                <NavIcon name={item.icon} />
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
