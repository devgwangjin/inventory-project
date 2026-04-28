import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { password } = await request.json()
  const appPassword = process.env.APP_PASSWORD

  if (!appPassword) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
  }

  if (password === appPassword) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('inventory-auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    return response
  }

  return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 })
}
