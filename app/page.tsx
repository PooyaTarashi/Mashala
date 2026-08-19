import mashalaApplication from "../mashala.config";
import { ANONYMOUS_AUTH_SCOPE_TAG } from "../src/conversation-store";
import { MashalaChat } from "./mashala-chat";

export default function Home() {
  return (
    <MashalaChat
      application={mashalaApplication}
      authScopeTag={ANONYMOUS_AUTH_SCOPE_TAG}
    />
  );
}
