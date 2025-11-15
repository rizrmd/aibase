export async function handle({ event, resolve }: any) {
	return resolve(event, { ssr: false });
}
