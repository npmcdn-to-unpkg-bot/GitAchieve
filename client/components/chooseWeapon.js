import React, { Component } from 'react';
import { connect } from 'react-redux';
import { browserHistory } from 'react-router';
import { bindActionCreators } from 'redux';
import actions from './../actions/ActionCreators';
import CommitChart from './commitChart';
import Repos from './repos';

class ChooseWeapon extends Component {
  compete() {
    browserHistory.push('/');
  }
  render() {
    return (
      <div className="data-results-container-clear">
        <h2>Choose Your Weapon // Repos</h2>
        <Repos />
        <div className="spacer-10px"></div>
        <div className="block text-centered">
          <input type="submit" value="COMPETE" className="button compete" onClick={this.compete} />
        </div>
      </div>
    );
  }
}

const mapStateToProps = (state) => {
  return state;
}

const mapDispatchToProps = dispatch => {
  return {
    actions: bindActionCreators(actions, dispatch)
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(ChooseWeapon);
