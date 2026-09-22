import SignupForm from "@/components/SignupForm";
import { previewInvite } from "@/server/team/invites";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite: token } = await searchParams;
  const preview = token ? await previewInvite(token) : null;

  return (
    <>
      {token && !preview ? (
        <div className="mx-auto max-w-sm px-5 pt-8">
          <p className="rounded-[4px] border border-danger-500 px-3 py-2 text-sm text-danger-500">
            This invite link has expired, been used, or been revoked. Ask whoever invited you for a new one. Signing up
            below creates a separate workspace.
          </p>
        </div>
      ) : null}
      <SignupForm invite={preview && token ? { token, ...preview } : null} />
    </>
  );
}
