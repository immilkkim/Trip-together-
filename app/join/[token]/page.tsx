import TripApp from "@/components/trip-app";

export default async function JoinTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TripApp inviteTokenOverride={token} />;
}
