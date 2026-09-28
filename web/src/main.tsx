import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider, useAuth } from "./auth";
import { Login } from "./Login";
import { Mailbox } from "./Mailbox";
import { Logo, LoadingSpinner, ErrorState, Button } from "./components";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./styles.css";
function App() {
  const { user, loading, error, retry, logout } = useAuth();
  if (loading)
    return (
      <div className="splash">
        <Logo />
        <LoadingSpinner />
      </div>
    );
  if (error && !user)
    return (
      <div className="splash">
        <Logo />
        <ErrorState message={error} retry={retry} />
        <Button className="secondary" onClick={() => void logout().then(retry)}>
          Return to sign in
        </Button>
      </div>
    );
  return user ? <Mailbox /> : <Login />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
