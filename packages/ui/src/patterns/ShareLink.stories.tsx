import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { REQUEST_URL, SHARE_URL } from "../../.storybook/fixtures";
import { CopyField } from "../components/copy-field/CopyField";
import { SaveLinkBox, ShareLinkPanel } from "../product";

// Pattern: Share link. Each story is one state of the pattern; rules on the pattern page.
const meta = {
  title: "Patterns/Share link",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const pad = (node: ReactNode) => <div className="max-w-text p-page-gutter">{node}</div>;

export const ShareAfterPublish: Story = { name: "Share link · after publishing (focus on the link)", render: () => pad(<ShareLinkPanel shareUrl={SHARE_URL} />) };
export const ShareRequestLink: Story = { name: "Share link · save the request link", render: () => pad(<SaveLinkBox url={REQUEST_URL} />) };
export const ShareCopyBlocked: Story = {
  name: "Share link · clipboard blocked",
  render: () => pad(<CopyField label="Twój link" value={SHARE_URL} hint="Wklej go tam, gdzie ludzie już cię pytają." />),
  play: async ({ canvasElement }) => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("blocked"); } } });
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Kopiuj link" }));
    await expect(await within(canvasElement).findByText(/skopiuj go ręcznie/)).toBeVisible();
  },
};
