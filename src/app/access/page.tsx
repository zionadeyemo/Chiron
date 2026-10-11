import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, accessCodes, accessToken, codeForToken, cookieOptions, safeNext } from "@/lib/access";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "CHIRON", robots: { index: false } };
export const dynamic = "force-dynamic";

// The shared access code (cost protection, not authentication). Shown once per browser when
// ACCESS_CODES is set; the code is recorded against the visitor so testers can be told apart.

async function enter(form: FormData) {
  "use server";
  const next = safeNext(String(form.get("next") ?? "/"));
  const code = String(form.get("code") ?? "")
    .trim()
    .toLowerCase();
  if (!accessCodes().includes(code)) redirect(`/access?wrong=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set(ACCESS_COOKIE, accessToken(code), cookieOptions());
  await db().put("meta", "access", { code, at: new Date().toISOString() });
  redirect(next);
}

export default async function AccessPage({ searchParams }: PageProps<"/access">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : "/");
  const codes = accessCodes();
  if (!codes.length || codeForToken((await cookies()).get(ACCESS_COOKIE)?.value, codes)) redirect(next);

  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col px-4 pt-20 pb-16 sm:px-8">
      <div className="font-mono text-[13px] font-medium tracking-[0.32em] text-ink">CHIRON</div>
      <h1 className="mt-6 max-w-[24ch] font-serif text-[32px] leading-[1.15] font-normal text-ink">Enter your access code</h1>
      <p className="mt-3 max-w-[52ch] font-serif text-[16px] text-muted">
        You should have received one with the link. Your work is saved in this browser — clearing cookies or switching devices starts fresh.
      </p>
      <form action={enter} className="mt-8 flex max-w-[420px] items-baseline gap-4">
        <input type="hidden" name="next" value={next} />
        <input
          name="code"
          autoFocus
          autoComplete="off"
          aria-label="Access code"
          placeholder="Access code"
          className="min-w-0 flex-1 border-b border-rule bg-transparent py-1.5 font-serif text-[17px] text-ink outline-none placeholder:text-faint focus:border-chiron"
        />
        <button type="submit" className="label text-chiron hover:text-ink">
          Continue
        </button>
      </form>
      {params.wrong && <p className="mt-3 font-serif text-[15px] text-oxblood">That code isn&apos;t valid.</p>}
    </main>
  );
}
