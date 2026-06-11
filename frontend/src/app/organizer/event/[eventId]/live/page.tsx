export default async function OrganizerLiveControlPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return (
    <main className="min-h-screen p-6">
      <p>Live Control Panel — {eventId}</p>
    </main>
  );
}
