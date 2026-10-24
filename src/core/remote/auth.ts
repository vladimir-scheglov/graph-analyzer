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
/**
 * Мини-обёртка «одна попытка с текущим токеном → 401 → перелогин → повтор».
 *
 * `creds.token` модифицируется in-place: при первом вызове с пустым токеном
 * логинимся; при 401 — сбрасываем и перелогиниваемся; при успехе — кэшируем.
 *
 * Не подходит для `apiCheckRobject`: та возвращает `Response` со `.status`
 * без throw, и 401 — это часть бизнес-логики (валидация). Там перелогин
 * делается вручную в `runValidation` / `handleValidateSingle`.
 */
export async function withTokenRefresh<T>(
  creds: {
    token: string | null;
    loginUrl: string;
    username: string;
    password: string;
    secure: boolean;
  },
  fn: (token: string) => Promise<T>,
): Promise<T> {
  if (!creds.token) {
    creds.token = await apiLogin(
      creds.loginUrl,
      creds.username,
      creds.password,
      creds.secure,
    );
  }

  try {
    return await fn(creds.token);
  } catch (e: any) {
    if (e?.status === 401) {
      creds.token = await apiLogin(
        creds.loginUrl,
        creds.username,
        creds.password,
        creds.secure,
      );
      return await fn(creds.token);
    }
    throw e;
  }
}