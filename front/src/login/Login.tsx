import React from "react";
import queryString from "query-string";
import {
  Link,
  RouteComponentProps,
  withRouter,
  Redirect,
} from "react-router-dom";
import styles from "./Login.module.scss";
import { localAuthService } from "./auth.service";

const fieldErrorsProps = (fieldName, errorField) => {
  console.log(fieldName, errorField);
  if (errorField === fieldName) {
    return {
      autoFocus: true,
      style: { border: "2px solid red" },
    };
  }
  return {};
};
export default withRouter(function Login(
  routeProps: RouteComponentProps<
    {},
    {},
    {
      error?: string;
      errorField?: string;
      returnTo?: string;
      username?: string;
    }
  >
) {
  const { REACT_APP_API_ENDPOINT } = process.env;

  const queries = queryString.parse(routeProps.location.search);

  if (queries.error || queries.returnTo) {
    const { error, errorField, returnTo, username } = queries;
    const state = {
      ...(queries.error ? { error, errorField, username } : {}),
      ...(!!returnTo ? { returnTo } : {}),
    };

    return <Redirect to={{ pathname: "/login", state }} />;
  }

  const { returnTo, error, errorField, username } =
    routeProps.location.state || {};

  return (
    <section className="section section-white">
      <div className="container">
        <form
          action={`${REACT_APP_API_ENDPOINT}/login`}
          method="post"
          name="login"
        >
          <h1>Connexion</h1>
          <div className="form__group">
            <label>
              Email
              <input
                type="email"
                name="email"
                defaultValue={username}
                {...fieldErrorsProps("email", errorField)}
              />
            </label>
            {error && errorField === "email" && (
              <div className={styles["form-error-message"]}>{error}</div>
            )}
          </div>

          <div className="form__group">
            <label>
              Mot de passe
              <input
                type="password"
                name="password"
                {...fieldErrorsProps("password", errorField)}
              />
            </label>
            {error && errorField === "password" && (
              <div className={styles["form-error-message"]}>{error}</div>
            )}
          </div>
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          {error && !errorField && (
            <div className={styles["form-error-message"]}>{error}</div>
          )}
          <div className="form__actions">
            <button
              className="button"
              type="submit"
              onClick={() => {
                localAuthService.locallySignOut();
                document.forms["login"].submit();
              }}
            >
              Se connecter
            </button>
          </div>
          <p>
            Vous n'avez pas encore de compte ?{" "}
            <Link to="/signup">Inscrivez vous maintenant</Link>
          </p>
          <p>
            Vous avez perdu votre mot de passe ?{" "}
            <Link to="/reset-password">Réinitialisez le</Link>
          </p>
        </form>
      </div>
    </section>
  );
});
