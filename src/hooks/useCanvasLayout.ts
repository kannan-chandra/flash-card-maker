import { useEffect, useMemo, useState, type RefObject } from 'react';

const SINGLE_COLUMN_BREAKPOINT = 1180;
const COMPACT_SPLIT_BREAKPOINT = 720;
const COMPACT_TOGGLE_BREAKPOINT = 420;
const NAV_RIGHT_CLEARANCE_PX = 38;
const FLOATING_PANEL_GUTTER_PX = 12;
const FLOATING_PANEL_ANCHOR_GAP_PX = 4;

interface UseCanvasLayoutArgs {
  sideWidth: number;
  sideHeight: number;
  doubleSided: boolean;
  canShowMobileNav: boolean;
  stageShellRef: RefObject<HTMLDivElement | null>;
  editorPanelRef: RefObject<HTMLElement | null>;
}

interface PanelPositionArgs {
  anchorX: number;
  anchorTop: number;
  anchorBottom: number;
  panelWidth: number;
  panelHeight: number;
}

export function useCanvasLayout(args: UseCanvasLayoutArgs) {
  const { sideWidth, sideHeight, doubleSided, canShowMobileNav, stageShellRef, editorPanelRef } = args;
  const [stageViewportWidth, setStageViewportWidth] = useState<number>(0);
  const [stageViewportHeight, setStageViewportHeight] = useState<number>(0);
  const [shellClientHeight, setShellClientHeight] = useState<number>(0);
  const [viewportLimitedHeight, setViewportLimitedHeight] = useState<number>(0);
  const [allocatedShellHeight, setAllocatedShellHeight] = useState<number>(0);
  const [browserViewportHeight, setBrowserViewportHeight] = useState<number>(0);
  const [stageShellRectTop, setStageShellRectTop] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const [stageShellLeft, setStageShellLeft] = useState<number>(0);
  const [stageShellTop, setStageShellTop] = useState<number>(0);

  const isNarrowLayout = viewportWidth > 0 && viewportWidth <= SINGLE_COLUMN_BREAKPOINT;
  const isCompactLayout = viewportWidth > 0 && viewportWidth <= COMPACT_SPLIT_BREAKPOINT;
  const doubleSidedUsesHorizontalSplit = isNarrowLayout && !isCompactLayout;
  const isHorizontalSplit = doubleSided && doubleSidedUsesHorizontalSplit;
  const useCompactToggleLabels = viewportWidth > 0 && viewportWidth <= COMPACT_TOGGLE_BREAKPOINT;
  const stageContentWidth = doubleSided && isHorizontalSplit ? sideWidth * 2 : sideWidth;
  const stageContentHeight = doubleSided ? (isHorizontalSplit ? sideHeight : sideHeight * 2) : sideHeight;
  const referenceWidth = doubleSidedUsesHorizontalSplit ? sideWidth * 2 : sideWidth;
  const referenceHeight = doubleSidedUsesHorizontalSplit ? sideHeight : sideHeight * 2;

  const stageScale = useMemo(() => {
    const widthScale = stageViewportWidth > 0 ? stageViewportWidth / referenceWidth : 1;
    const heightScale = stageViewportHeight > 0 ? stageViewportHeight / referenceHeight : 1;
    const renderedHeightScale = stageViewportHeight > 0 ? stageViewportHeight / stageContentHeight : 1;
    return Math.max(0.01, Math.min(widthScale, heightScale, renderedHeightScale));
  }, [referenceHeight, referenceWidth, stageContentHeight, stageViewportHeight, stageViewportWidth]);

  const scaledStageWidth = stageContentWidth * stageScale;
  const scaledStageHeight = stageContentHeight * stageScale;
  const widthScale = stageViewportWidth > 0 ? stageViewportWidth / referenceWidth : 1;
  const heightScale = stageViewportHeight > 0 ? stageViewportHeight / referenceHeight : 1;
  const renderedHeightScale = stageViewportHeight > 0 ? stageViewportHeight / stageContentHeight : 1;
  const stageSideGap = Math.max((stageViewportWidth - scaledStageWidth) / 2, 0);
  const showMobileNav = isNarrowLayout && canShowMobileNav;
  const stageWrapShiftX = showMobileNav ? Math.max(0, NAV_RIGHT_CLEARANCE_PX - stageSideGap) : 0;
  const stageWrapLeft = stageShellLeft + stageSideGap - stageWrapShiftX;
  const stageWrapTop = stageShellTop;

  useEffect(() => {
    const shell = stageShellRef.current;
    if (!shell) {
      return;
    }

    const syncLayout = () => {
      setStageViewportWidth(shell.clientWidth);
      const measuredViewportWidth = window.visualViewport?.width ?? window.innerWidth;
      setViewportWidth(measuredViewportWidth);
      const rect = shell.getBoundingClientRect();
      setStageShellLeft(rect.left);
      setStageShellTop(rect.top);
      setStageShellRectTop(rect.top);
      const rootStyle = window.getComputedStyle(document.documentElement);
      const appGutterPx = Number.parseFloat(rootStyle.getPropertyValue('--app-gutter')) || 20;
      const measuredViewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setBrowserViewportHeight(measuredViewportHeight);
      const nextViewportLimitedHeight = Math.max(0, measuredViewportHeight - rect.top - appGutterPx);
      setViewportLimitedHeight(nextViewportLimitedHeight);
      const nextShellHeight = Math.max(0, shell.clientHeight);
      setShellClientHeight(nextShellHeight);
      const editorRect = editorPanelRef.current?.getBoundingClientRect();
      const allocatedHeightFromPanel = editorRect ? Math.max(0, editorRect.bottom - rect.top) : 0;
      setAllocatedShellHeight(allocatedHeightFromPanel);
      const narrowWidth = measuredViewportWidth <= SINGLE_COLUMN_BREAKPOINT;
      const availableHeight = narrowWidth
        ? Math.max(0, Math.min(nextViewportLimitedHeight, allocatedHeightFromPanel || nextViewportLimitedHeight))
        : nextViewportLimitedHeight;
      setStageViewportHeight(availableHeight);
    };

    syncLayout();
    window.addEventListener('resize', syncLayout);

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', syncLayout);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => syncLayout());
      observer.observe(shell);
    }

    return () => {
      window.removeEventListener('resize', syncLayout);
      viewport?.removeEventListener('resize', syncLayout);
      observer?.disconnect();
    };
  }, [editorPanelRef, stageShellRef]);

  function getPanelPosition(args: PanelPositionArgs) {
    const availableViewportWidth = viewportWidth || window.visualViewport?.width || window.innerWidth;
    const availableViewportHeight = window.visualViewport?.height || window.innerHeight;
    const panelRenderWidth = Math.min(args.panelWidth, Math.max(220, availableViewportWidth - FLOATING_PANEL_GUTTER_PX * 2));
    const desiredLeftAbs = isCompactLayout ? (availableViewportWidth - panelRenderWidth) / 2 : stageWrapLeft + args.anchorX;
    const maxLeftAbs = Math.max(FLOATING_PANEL_GUTTER_PX, availableViewportWidth - panelRenderWidth - FLOATING_PANEL_GUTTER_PX);
    const clampedLeftAbs = Math.min(Math.max(desiredLeftAbs, FLOATING_PANEL_GUTTER_PX), maxLeftAbs);
    const belowTopAbs = stageWrapTop + args.anchorBottom + FLOATING_PANEL_ANCHOR_GAP_PX;
    const aboveTopAbs = stageWrapTop + args.anchorTop - args.panelHeight - FLOATING_PANEL_ANCHOR_GAP_PX;
    const fitsBelow = belowTopAbs + args.panelHeight <= availableViewportHeight - FLOATING_PANEL_GUTTER_PX;
    const topAbs = fitsBelow ? belowTopAbs : Math.max(FLOATING_PANEL_GUTTER_PX, aboveTopAbs);
    return {
      left: clampedLeftAbs - stageWrapLeft,
      top: topAbs - stageWrapTop,
      width: panelRenderWidth
    };
  }

  return {
    breakpoints: {
      singleColumn: SINGLE_COLUMN_BREAKPOINT,
      compactSplit: COMPACT_SPLIT_BREAKPOINT
    },
    viewport: {
      width: viewportWidth,
      height: browserViewportHeight
    },
    measured: {
      stageViewportWidth,
      stageViewportHeight,
      shellClientHeight,
      allocatedShellHeight,
      viewportLimitedHeight,
      stageShellRectTop
    },
    layout: {
      isNarrowLayout,
      isCompactLayout,
      doubleSidedUsesHorizontalSplit,
      isHorizontalSplit,
      useCompactToggleLabels
    },
    footprint: {
      stageContentWidth,
      stageContentHeight,
      referenceWidth,
      referenceHeight
    },
    scale: {
      stageScale,
      scaledStageWidth,
      scaledStageHeight,
      widthScale,
      heightScale,
      renderedHeightScale
    },
    placement: {
      stageSideGap,
      showMobileNav,
      stageWrapShiftX,
      stageWrapLeft,
      stageWrapTop
    },
    getPanelPosition
  };
}
