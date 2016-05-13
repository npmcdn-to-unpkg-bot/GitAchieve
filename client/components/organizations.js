import React, { Component } from 'react';
import { connect } from 'react-redux';
import { browserHistory } from 'react-router';
import { bindActionCreators } from 'redux';
import actions from './../actions/ActionCreators';
import axios from 'axios';

const ROOT_URL = 'http://127.0.0.1:8000';

class Organizations extends Component {
  constructor(props) {
    super(props);
    this.state = { orgsList: [] };
  }

  componentWillMount() {
    axios.get(`${ROOT_URL}/api/v1/orgs/${this.props.user.username}/orgs`)
      .then(response => {
        this.setState({orgsList: response.data})
      });
  }

  render() {
    return (
      <div>
        <h4>Organizations</h4>
        {this.state.orgsList.map((org, index) => {
          return (
            <div key={index} className="org-container">
            <img className="user-avatar-1" src={org.avatar_url} />
              <h4>{org.orgname}</h4>
            </div>
          )
        })}
      </div>
    )
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

export default connect(mapStateToProps, mapDispatchToProps)(Organizations);
