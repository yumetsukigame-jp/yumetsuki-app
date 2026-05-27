export const api = (path: string, options: RequestInit = {}) => {
  const base = process.env.NEXT_PUBLIC_API_BASE!;
  return fetch(`${base}/${path}`, options).then((res) => res.json());
};
