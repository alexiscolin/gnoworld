import { LoginControl, useLogin } from "../LoginControl.tsx";

// The header's account holds the hook and the way out (8p): this stands in for it, the way out shown once the session is in.
export function Account() {
  const { login, logIn, logOut } = useLogin();
  return (
    <>
      <LoginControl login={login} logIn={logIn} />
      {login.session.kind === "in" ? (
        <button type="button" onClick={logOut}>
          Log out
        </button>
      ) : null}
    </>
  );
}
