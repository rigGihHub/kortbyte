import { auth } from './auth-server';

export async function requireUser() {
  const { data } = await auth.getSession();
  if (!data?.user) return null;
  return data.user;
}
