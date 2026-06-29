import './index.less';

type BlueprintBgProps = {
  isPaused?: boolean;
};

export const BlueprintBg = ({ isPaused = false }: BlueprintBgProps) => {
  const animationClass = isPaused ? 'is-paused' : '';

  return (
    <div className={`login-blueprint-bg ${animationClass}`} aria-hidden="true">
      <svg
        className="login-blueprint-bg__svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="blueprintLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#0E7490" stopOpacity="0" />
            <stop offset="42%" stopColor="#0E7490" stopOpacity="0.42" />
            <stop offset="68%" stopColor="#C47A2C" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="blueprint-grid"
          d="M160 50V850M360 50V850M560 50V850M760 50V850M960 50V850M1160 50V850M80 160H1360M80 360H1360M80 560H1360M80 760H1360"
        />
        <path
          className="blueprint-line"
          d="M-40 190H210C270 190 286 255 346 255H690C748 255 762 190 824 190H1480"
        />
        <path
          className="blueprint-line blueprint-line--slow"
          d="M-20 615H245C310 615 326 548 390 548H770C834 548 850 615 916 615H1460"
        />
        <path
          className="blueprint-line blueprint-line--faint"
          d="M150 40V230M150 670V870M1260 30V265M1260 620V880"
        />
        <rect
          className="blueprint-document"
          x="955"
          y="290"
          width="210"
          height="270"
          rx="8"
        />
        <path
          className="blueprint-document-detail"
          d="M1000 350H1125M1000 405H1110M1000 460H1138"
        />
        <circle
          className="blueprint-node blueprint-node--one"
          cx="346"
          cy="255"
          r="5"
        />
        <circle
          className="blueprint-node blueprint-node--two"
          cx="770"
          cy="548"
          r="5"
        />
        <circle
          className="blueprint-node blueprint-node--three"
          cx="955"
          cy="425"
          r="5"
        />
      </svg>
    </div>
  );
};

export const BgSvg = BlueprintBg;
