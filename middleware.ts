import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized({ req, token }) {
      if (req.nextUrl.pathname === "/admin/login") return true;
      return token != null;
    }
  }
});

export const config = {
  matcher: ["/admin/:path*"]
};
