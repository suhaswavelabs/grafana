import { css, cx } from '@emotion/css';
import { isEqual } from 'lodash';
import memoizeOne from 'memoize-one';
import React, { PureComponent } from 'react';

import { CoreApp, Field, GrafanaTheme2, LinkModel, LogLabelStatsModel, LogRowModel } from '@grafana/data';
import { reportInteraction } from '@grafana/runtime';
import { ClipboardButton, DataLinkButton, Themeable2, ToolbarButton, ToolbarButtonRow, withTheme2 } from '@grafana/ui';

import { LogLabelStats } from './LogLabelStats';
import { getLogRowStyles } from './getLogRowStyles';

//Components

export interface Props extends Themeable2 {
  parsedValue: string;
  parsedKey: string;
  parsedValueArray?: Array<string | number | boolean | undefined>;
  parsedKeyArray?: string[];
  wrapLogMessage?: boolean;
  isLabel?: boolean;
  onClickFilterLabel?: (key: string, value: string) => void;
  onClickFilterOutLabel?: (key: string, value: string) => void;
  links?: Array<LinkModel<Field>>;
  getStats: () => LogLabelStatsModel[] | null;
  displayedFields?: string[];
  onClickShowField?: (key: string) => void;
  onClickHideField?: (key: string) => void;
  row: LogRowModel;
  app?: CoreApp;
}

interface State {
  showFieldsStats: boolean;
  fieldCount: number;
  fieldStats: LogLabelStatsModel[] | null;
  showLineScroll: boolean;
}

const getStyles = memoizeOne((theme: GrafanaTheme2, activeButton: boolean) => {
  // those styles come from ToolbarButton. Unfortunately this is needed because we can not control the variant of the menu-button in a ToolbarButtonRow.
  const defaultOld = css`
    color: ${theme.colors.text.secondary};
    background-color: ${theme.colors.background.primary};

    &:hover {
      color: ${theme.colors.text.primary};
      background: ${theme.colors.background.secondary};
    }
  `;

  const defaultTopNav = css`
    color: ${theme.colors.text.secondary};
    background-color: transparent;
    border-color: transparent;

    &:hover {
      color: ${theme.colors.text.primary};
      background: ${theme.colors.background.secondary};
    }
  `;

  const active = css`
    color: ${theme.v1.palette.orangeDark};
    border-color: ${theme.v1.palette.orangeDark};
    background-color: transparent;

    &:hover {
      color: ${theme.colors.text.primary};
      background: ${theme.colors.emphasize(theme.colors.background.canvas, 0.03)};
    }
  `;

  const defaultToolbarButtonStyle = theme.flags.topnav ? defaultTopNav : defaultOld;
  return {
    noHoverBackground: css`
      label: noHoverBackground;
      :hover {
        background-color: transparent;
      }
    `,
    hoverCursor: css`
      label: hoverCursor;
      cursor: pointer;
    `,
    wordBreakAll: css`
      label: wordBreakAll;
      word-break: break-all;
    `,
    showingField: css`
      color: ${theme.colors.primary.text};
    `,
    copyButton: css`
      & > button {
        color: ${theme.colors.text.secondary};
        padding: 0;
        justify-content: center;
        border-radius: 50%;
        height: ${theme.spacing(theme.components.height.sm)};
        width: ${theme.spacing(theme.components.height.sm)};
        svg {
          margin: 0;
        }

        span > div {
          top: -5px;
          & button {
            color: ${theme.colors.success.main};
          }
        }
      }
    `,
    wrapLine: css`
      label: wrapLine;
      white-space: pre-wrap;
    `,
    parsedValue: css`
      display: inline;
    `,
    toolbarButtonRow: css`
      label: toolbarButtonRow;
      gap: ${theme.spacing(0.5)};

      max-width: calc(3 * ${theme.spacing(theme.components.height.sm)});
      & > div {
        height: ${theme.spacing(theme.components.height.sm)};
        width: ${theme.spacing(theme.components.height.sm)};
        & > button {
          border: 0;
          background-color: transparent;
          height: inherit;

          &:hover {
            box-shadow: none;
            border-radius: 50%;
          }
        }
      }
      & div:last-child > button:not(.stats-button) {
        ${activeButton ? active : defaultToolbarButtonStyle};
      }
    `,
    logDetailsStats: css`
      padding: 0 ${theme.spacing(1)};
    `,
    logDetailsValue: css`
      display: table-cell;
      vertical-align: middle;
      line-height: 22px;

      .show-on-hover {
        display: inline;
        visibility: hidden;
      }
      &:hover {
        .show-on-hover {
          visibility: visible;
        }
      }
    `,
    multiRowLink: css`
      vertical-align: middle;
      width: fit-content !important;
    `,
  };
});

class UnThemedLogDetailsRow extends PureComponent<Props, State> {
  state: State = {
    showFieldsStats: false,
    fieldCount: 0,
    fieldStats: null,
    showLineScroll: false,
  };

  componentDidUpdate() {
    if (this.state.showFieldsStats) {
      this.updateStats();
    }
  }

  showField = () => {
    const { onClickShowField: onClickShowDetectedField, parsedKey, row } = this.props;
    if (onClickShowDetectedField) {
      onClickShowDetectedField(parsedKey);
    }

    reportInteraction('grafana_explore_logs_log_details_replace_line_clicked', {
      datasourceType: row.datasourceType,
      logRowUid: row.uid,
      type: 'enable',
    });
  };

  hideField = () => {
    const { onClickHideField: onClickHideDetectedField, parsedKey, row } = this.props;
    if (onClickHideDetectedField) {
      onClickHideDetectedField(parsedKey);
    }

    reportInteraction('grafana_explore_logs_log_details_replace_line_clicked', {
      datasourceType: row.datasourceType,
      logRowUid: row.uid,
      type: 'disable',
    });
  };

  filterLabel = () => {
    const { onClickFilterLabel, parsedKey, parsedValue, row } = this.props;
    if (onClickFilterLabel) {
      onClickFilterLabel(parsedKey, parsedValue);
    }

    reportInteraction('grafana_explore_logs_log_details_filter_clicked', {
      datasourceType: row.datasourceType,
      filterType: 'include',
      logRowUid: row.uid,
    });
  };

  filterOutLabel = () => {
    const { onClickFilterOutLabel, parsedKey, parsedValue, row } = this.props;
    if (onClickFilterOutLabel) {
      onClickFilterOutLabel(parsedKey, parsedValue);
    }

    reportInteraction('grafana_explore_logs_log_details_filter_clicked', {
      datasourceType: row.datasourceType,
      filterType: 'exclude',
      logRowUid: row.uid,
    });
  };

  updateStats = () => {
    const { getStats } = this.props;
    const fieldStats = getStats();
    const fieldCount = fieldStats ? fieldStats.reduce((sum, stat) => sum + stat.count, 0) : 0;
    if (!isEqual(this.state.fieldStats, fieldStats) || fieldCount !== this.state.fieldCount) {
      this.setState({ fieldStats, fieldCount });
    }
  };

  showStats = () => {
    const { isLabel, row, app } = this.props;
    const { showFieldsStats } = this.state;
    if (!showFieldsStats) {
      this.updateStats();
    }
    this.toggleFieldsStats();

    reportInteraction('grafana_explore_logs_log_details_stats_clicked', {
      dataSourceType: row.datasourceType,
      fieldType: isLabel ? 'label' : 'detectedField',
      type: showFieldsStats ? 'close' : 'open',
      logRowUid: row.uid,
      app,
    });
  };

  toggleFieldsStats() {
    this.setState((state) => {
      return {
        showFieldsStats: !state.showFieldsStats,
      };
    });
  }

  generateTableRow(
    key: string,
    activeButton: boolean,
    value?: string,
    toggleFieldButton?: JSX.Element,
    links?: Array<LinkModel<Field>>,
    hasFilteringFunctionality?: boolean,
    multiRow?: boolean,
    firstLinkRow?: boolean,
    totalRows?: number
  ) {
    const { theme, displayedFields, wrapLogMessage } = this.props;
    const { showFieldsStats } = this.state;
    const styles = getStyles(theme, activeButton);
    const style = getLogRowStyles(theme);

    return (
      <tr className={cx(style.logDetailsValue)}>
        <td className={style.logsDetailsIcon}>
          <ToolbarButtonRow alignment="left" className={styles.toolbarButtonRow}>
            {hasFilteringFunctionality && (
              <ToolbarButton iconOnly narrow icon="search-plus" tooltip="Filter for value" onClick={this.filterLabel} />
            )}
            {hasFilteringFunctionality && (
              <ToolbarButton
                iconOnly
                narrow
                icon="search-minus"
                tooltip="Filter out value"
                onClick={this.filterOutLabel}
              />
            )}
            {displayedFields && toggleFieldButton}
            {!multiRow && (
              <ToolbarButton
                iconOnly
                variant={showFieldsStats ? 'active' : 'default'}
                narrow
                icon="signal"
                tooltip="Ad-hoc statistics"
                className="stats-button"
                onClick={this.showStats}
              />
            )}
          </ToolbarButtonRow>
        </td>

        {/* Key - value columns */}
        <td className={style.logDetailsLabel}>{key}</td>
        <td className={cx(styles.wordBreakAll, wrapLogMessage && styles.wrapLine, multiRow && styles.multiRowLink)}>
          <div className={styles.logDetailsValue}>
            {value}
            {value && (
              <div className={cx('show-on-hover', styles.copyButton)}>
                <ClipboardButton
                  getText={() => value}
                  title="Copy value to clipboard"
                  fill="text"
                  variant="secondary"
                  icon="copy"
                  size="md"
                />
              </div>
            )}

            {!multiRow &&
              links?.map((link) => (
                <span key={link.title}>
                  &nbsp;
                  <DataLinkButton link={link} />
                </span>
              ))}
          </div>
        </td>
        {multiRow && firstLinkRow && (
          <td rowSpan={totalRows} className={styles.multiRowLink}>
            {links?.map((link) => (
              <span key={link.title}>
                &nbsp;
                <DataLinkButton link={link} />
              </span>
            ))}
          </td>
        )}
      </tr>
    );
  }

  render() {
    const {
      theme,
      parsedKey,
      parsedValue,
      parsedKeyArray,
      parsedValueArray,
      isLabel,
      links,
      displayedFields,
      onClickFilterLabel,
      onClickFilterOutLabel,
    } = this.props;
    const { showFieldsStats, fieldStats, fieldCount } = this.state;
    const activeButton = displayedFields?.includes(parsedKey) || showFieldsStats;
    const styles = getStyles(theme, activeButton);
    const hasFilteringFunctionality = onClickFilterLabel !== undefined && onClickFilterOutLabel !== undefined;

    const toggleFieldButton =
      displayedFields && displayedFields.includes(parsedKey) ? (
        <ToolbarButton variant="active" tooltip="Hide this field" iconOnly narrow icon="eye" onClick={this.hideField} />
      ) : (
        <ToolbarButton
          tooltip="Show this field instead of the message"
          iconOnly
          narrow
          icon="eye"
          onClick={this.showField}
        />
      );

    return (
      <>
        {(parsedKeyArray === undefined || parsedKeyArray?.length === 0) &&
          this.generateTableRow(
            parsedKey,
            activeButton,
            parsedValue,
            toggleFieldButton,
            links,
            hasFilteringFunctionality,
            false
          )}
        {parsedKeyArray && (
          <tr>
            <td colSpan={3}>
              <table>
                <tbody>
                  {parsedKeyArray.map((parsedKey, i) =>
                    this.generateTableRow(
                      parsedKey,
                      false,
                      parsedValueArray ? parsedValueArray[i]?.toString() : undefined,
                      undefined,
                      links,
                      false,
                      true,
                      i === 0,
                      parsedKeyArray.length
                    )
                  )}
                </tbody>
              </table>
            </td>
          </tr>
        )}

        {showFieldsStats && (
          <tr>
            <td>
              <ToolbarButtonRow alignment="left" className={styles.toolbarButtonRow}>
                <ToolbarButton
                  iconOnly
                  variant={showFieldsStats ? 'active' : 'default'}
                  narrow
                  icon="signal"
                  tooltip="Hide ad-hoc statistics"
                  onClick={this.showStats}
                />
              </ToolbarButtonRow>
            </td>
            <td colSpan={2}>
              <div className={styles.logDetailsStats}>
                <LogLabelStats
                  stats={fieldStats!}
                  label={parsedKey}
                  value={parsedValue}
                  rowCount={fieldCount}
                  isLabel={isLabel}
                />
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }
}

export const LogDetailsRow = withTheme2(UnThemedLogDetailsRow);
LogDetailsRow.displayName = 'LogDetailsRow';
