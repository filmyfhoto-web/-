import { forwardRef } from "react";
import { Helmet } from "@/lib/head";
import { getHostMode } from "@/lib/hostMode";

const BASE_URL = "https://filmyynatta.com";

type Props = {
  title: string;
  description: string;
  path: string;
};

const SeoHead = forwardRef<HTMLElement, Props>(function SeoHead({ title, description, path }, _ref) {
  const url = `${BASE_URL}${path}`;
  const isAdminHost = getHostMode() === "admin";
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {isAdminHost && <meta name="robots" content="noindex,nofollow" />}
    </Helmet>
  );
});

export default SeoHead;
