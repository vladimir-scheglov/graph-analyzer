import { httpPost } from "./http-client";

const LOGIN_QUERY = `mutation login($input: LoginRequest!) {
  login(input: $input) {
    loginResult { accessToken refreshToken }
    secondFactor { isEnabled sessionToken }
    forceChangePasswordSession { reason sessionId }
  }
}`;

export async function apiLogin(
  loginUrl: string,
  username: string,
  password: string,
  rejectUnauthorized: boolean,
): Promise<string> {
  const res = await httpPost(
    loginUrl,
    {
      operationName: "login",
      variables: { input: { password, username } },
      query: LOGIN_QUERY,
    },
    {},
    rejectUnauthorized,
  );

  if (res.status !== 200) throw new Error("HTTP " + res.status);

  const login = res.json?.data?.login;
  if (!login) throw new Error("Нет данных в ответе");

  const token = login.loginResult?.accessToken;
  if (!token) {
    if (login.forceChangePasswordSession) {
      throw new Error(
        "Требуется смена пароля: " +
          (login.forceChangePasswordSession.reason || ""),
      );
    }
    throw new Error("accessToken отсутствует");
  }
  return token;
}
