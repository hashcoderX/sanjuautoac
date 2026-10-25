import { redirect } from 'next/navigation';

type HomePageProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const view = Array.isArray(params?.view) ? params.view[0] : params?.view;

  if (view === 'login') {
    redirect('/dashboard/login');
  }

  redirect('/website');
}
