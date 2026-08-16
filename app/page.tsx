import mashalaApplication from "../mashala.config";
import { MashalaChat } from "./mashala-chat";

export default function Home() {
  return <MashalaChat application={mashalaApplication} />;
}
