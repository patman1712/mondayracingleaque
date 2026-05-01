export function SignOutButton() {
  return (
    <form action="/admin/logout" method="post">
      <button
        className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
        type="submit"
      >
        Logout
      </button>
    </form>
  );
}
