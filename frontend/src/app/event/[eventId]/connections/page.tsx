export default async function ConnectionsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return (
    <main className="min-h-screen p-6">
      <p>Digital Rolodex — {eventId}</p>
    </main>
  );
}
