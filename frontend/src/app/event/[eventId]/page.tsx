export default async function EventLandingPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return (
    <main className="min-h-screen p-6">
      <p>Event Landing — {eventId}</p>
    </main>
  );
}
