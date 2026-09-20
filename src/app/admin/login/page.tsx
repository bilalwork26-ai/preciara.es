import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createSessionToken,
  isAdminAuthConfigured,
  verifyAdminPassword,
} from "@/server/admin/auth";
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from "@/server/admin/rateLimit";

async function requestKey(): Promise<string> {
  const hdrs = await headers();
  const forwardedFor = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || hdrs.get("x-real-ip") || "unknown";
}

export const metadata = {
  title: "Acceso — Panel técnico",
  robots: { index: false, follow: false },
};

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const nextParam = String(formData.get("next") ?? "/admin");
  const next = nextParam.startsWith("/admin") ? nextParam : "/admin";
  const key = await requestKey();

  if (isLoginLocked(key)) {
    redirect(`/admin/login?error=locked&next=${encodeURIComponent(next)}`);
  }

  if (!verifyAdminPassword(password)) {
    recordLoginFailure(key);
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }
  clearLoginFailures(key);

  const token = createSessionToken();
  if (!token) {
    redirect("/admin/login?error=1");
  }

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });

  redirect(next);
}

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (!isAdminAuthConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
        <p className="max-w-sm text-center text-sm text-navy-100">
          El panel técnico no está configurado en este entorno.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const hasError = params.error === "1";
  const isLocked = params.error === "locked";
  const next = typeof params.next === "string" ? params.next : "/admin";

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <form action={login} className="w-full max-w-sm rounded-2xl border border-white/10 bg-navy-800 p-6">
        <h1 className="font-serif text-xl font-bold text-white">Panel técnico</h1>
        <p className="mt-1 text-sm text-navy-100">Acceso restringido a administración de Preciara.</p>

        {isLocked && (
          <p className="mt-4 rounded-lg bg-coral-500/15 px-3 py-2 text-sm text-coral-100" role="alert">
            Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.
          </p>
        )}
        {hasError && !isLocked && (
          <p className="mt-4 rounded-lg bg-coral-500/15 px-3 py-2 text-sm text-coral-100" role="alert">
            Contraseña incorrecta.
          </p>
        )}

        <label htmlFor="admin-password" className="mt-5 block text-sm font-medium text-navy-100">
          Contraseña
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-navy-900 px-3 py-2 text-white outline-none focus-visible:border-teal-500"
        />
        <input type="hidden" name="next" value={next} />

        <button
          type="submit"
          className="mt-5 w-full rounded-full bg-teal-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
