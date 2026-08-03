export default function Download() {
  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-[20px]">download mortal manager</h1>
      <p className="text-mute text-[12px]">
        builds for macos, windows and linux are coming. no dead buttons here: the desktop
        manager has not shipped a signed build yet, and this page will say so until it has.
      </p>
      <p className="text-mute text-[12px]">
        today the proof of concept runs from source: clone the repository, then
        <code className="mx-1 text-ink">pnpm install</code> and follow the dev flow in the
        readme. the runtime, your identities, and their destruction all happen locally on your
        machine; this site never touches them.
      </p>
    </div>
  );
}
