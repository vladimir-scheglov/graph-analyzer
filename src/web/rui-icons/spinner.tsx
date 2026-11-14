
export const SpinnerIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
height="16"
fill = "none"
viewBox = "0 0 24 24"

  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M12 4.5a7.5 7.5 0 1 0 0 15V22a10 10 0 1 1 0-20 1.25 1.25 0 1 1 0 2.5"
      clipRule="evenodd"
    />
    <path
      fill="url(#a)"
      fillRule="evenodd"
      d="M12 4.5a7.5 7.5 0 0 1 0 15V22a10 10 0 1 0 0-20z"
      clipRule="evenodd"
    />
    <defs>
      <linearGradient
        id="a"
        x1={17}
        x2={17}
        y1={2}
        y2={22}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#709feb" stopOpacity={0} />
        <stop offset={1} stopColor="#709feb" />
      </linearGradient>
    </defs>
  </svg >
);
