export default async function LiveDashboardPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return (
    <main className="min-h-screen p-6">
      <p>Live Dashboard — {eventId}</p>
    </main>
  );
}
