export default async function RegisterPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return (
    <main className="min-h-screen p-6">
      <p>Registration — {eventId}</p>
    </main>
  );
}
