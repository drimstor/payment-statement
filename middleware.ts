import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Payments"',
    },
  });
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/pay")) {
    return NextResponse.next();
  }

  const user = process.env.PAYMENT_BASIC_AUTH_USER;
  const password = process.env.PAYMENT_BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    return unauthorized();
  }

  const header = request.headers.get("authorization");

  if (!header || !header.startsWith("Basic ")) {
    return unauthorized();
  }

  const base64Credentials = header.slice("Basic ".length);

  let decoded: string;

  try {
    decoded = Buffer.from(base64Credentials, "base64").toString("utf8");
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return unauthorized();
  }

  const receivedUser = decoded.slice(0, separatorIndex);
  const receivedPassword = decoded.slice(separatorIndex + 1);

  if (receivedUser !== user || receivedPassword !== password) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/pay"],
};
