import { createFileRoute } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";

import SupplyChainRisk from "../components/SupplyChainRisk";
import { GitHubIcon } from "../components/icons";
import { getRiskScenario, getScenarioDescription, getScenarioTitle } from "../lib/riskModel";
import { buildRiskScenarioUrls, parseRiskSearchRecord } from "../lib/riskSearch";

const currentUrl = createIsomorphicFn()
  .client(() => new URL(window.location.href))
  .server(async () => {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    return getRequestUrl({ xForwardedHost: true, xForwardedProto: true });
  });

export const Route = createFileRoute("/")({
  validateSearch: parseRiskSearchRecord,
  head: async ({ match }) => {
    const scenario = getRiskScenario(match.search);
    const title = getScenarioTitle(scenario);
    const description = getScenarioDescription(scenario);
    const { pageUrl, ogImageUrl } = buildRiskScenarioUrls(match.search, await currentUrl());

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: pageUrl },
        { property: "og:image", content: ogImageUrl },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImageUrl },
      ],
    };
  },
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:px-4 sm:py-6 lg:py-8">
      <SupplyChainRisk />
      <footer className="mx-auto mt-8 grid max-w-7xl grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3 border-t border-slate-200/80 pt-5 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        <p className="col-start-2 text-center">
          No affiliation or endorsement by npm, Inc. Made by{" "}
          <a
            href="https://philippeserhal.com/"
            className="rounded-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none dark:text-slate-300 dark:decoration-slate-700 dark:hover:text-slate-100 dark:focus-visible:ring-slate-100"
          >
            Philippe Serhal
          </a>{" "}
          with a grain of salt bigger than your node_modules.
        </p>
        <a
          href="https://github.com/serhalp/npm.tax"
          aria-label="View npm.tax on GitHub"
          className="col-start-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-slate-100"
        >
          <GitHubIcon />
        </a>
      </footer>
    </main>
  );
}
