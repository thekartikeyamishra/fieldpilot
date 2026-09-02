import VoiceJob from "@/components/VoiceJob";
import { requireSession } from "@/server/auth/session";
import { Legend } from "@/components/ui";
import { voiceProvider } from "@/integrations/assemblyai/voice-provider";

export const dynamic = "force-dynamic";

export default async function JobPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const firstRun = params.first === "1";

  // Checked on the server so the UI never offers a button that cannot work.
  const voiceEnabled = voiceProvider.isConfigured();

  return (
    <div className="space-y-5">
      <div>
        <Legend>{firstRun ? "Your first job" : "Voice job"}</Legend>
        <h1 className="text-2xl font-semibold tracking-tight">
          {firstRun ? `Tell FieldPilot what happened, ${session.name.split(" ")[0]}` : "Tell FieldPilot what happened"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Name the asset and the symptom. FieldPilot pulls the history, cites its evidence and drafts the action —
          nothing is recorded until you approve it.
        </p>
      </div>

      <VoiceJob firstRun={firstRun} voiceEnabled={voiceEnabled} />
    </div>
  );
}
