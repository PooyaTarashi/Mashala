import mashalaApplication from "../mashala.config";
import { AiWalletClient } from "./ai-wallet-client";

const AI_WALLET_BACKEND = "http://127.0.0.1:8000";

export default function Home() {
  return (
    <AiWalletClient
      application={mashalaApplication}
      backendBaseUrl={AI_WALLET_BACKEND}
    />
  );
}
